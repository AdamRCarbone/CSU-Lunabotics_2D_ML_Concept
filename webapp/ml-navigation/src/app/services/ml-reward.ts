// ML Reward Service - Calculates rewards based on state transitions

import { Injectable } from '@angular/core';
import { EnvironmentComponent } from '../../environment/environment';
import { Zone } from '../enums/zone.enum';
import { MLConfig, DEFAULT_ML_CONFIG } from '../interfaces/ml-types';

interface RewardState {
  orbs_held: number;
  zone: Zone;
  position_x: number;
  position_y: number;
  nearest_orb_distance: number;
  construction_zone_distance: number;
  speed: number;      // Current speed
  heading: number;    // Current heading (0-360)
}

@Injectable({
  providedIn: 'root'
})
export class MLRewardService {
  private environment: EnvironmentComponent | null = null;
  private config: MLConfig = DEFAULT_ML_CONFIG;

  setEnvironment(env: EnvironmentComponent) {
    this.environment = env;
  }

  private previousState: RewardState | null = null;
  private episodeReward: number = 0;
  private previousOrbsHeld: number = 0;
  private orbsDepositedThisEpisode: number = 0;
  private orbsDepositedConstruction: number = 0;
  private orbsDepositedBerm: number = 0;

  // Progression tracking
  private hasLeftStartingZone: boolean = false;
  private previousZone: Zone | null = null;
  private hasLeftExcavationWithOrbs: boolean = false;  // Track if we've rewarded leaving excavation this cycle
  private hasEnteredConstructionWithOrbs: boolean = false;  // Track if we've rewarded entering construction this cycle

  // Oscillation detection
  private speedHistory: number[] = [];

  // Orb management tracking
  private consecutiveBadDrops: number = 0;
  private lastDroppedOrbCount: number = 0;

  /**
   * Update configuration
   */
  setConfig(config: Partial<MLConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset reward tracking for new episode
   */
  resetEpisode() {
    this.previousState = null;
    this.episodeReward = 0;
    this.previousOrbsHeld = 0;
    this.orbsDepositedThisEpisode = 0;
    this.orbsDepositedConstruction = 0;
    this.orbsDepositedBerm = 0;
    this.hasLeftStartingZone = false;
    this.previousZone = null;
    this.hasLeftExcavationWithOrbs = false;
    this.hasEnteredConstructionWithOrbs = false;
    this.speedHistory = [];
    this.consecutiveBadDrops = 0;
    this.lastDroppedOrbCount = 0;
  }

  /**
   * Calculate reward for current step with progression-based structure
   * Returns { reward, info }
   */
  calculateReward(): { reward: number; done: boolean; info: any } {
    const currentState = this.getCurrentState();
    let reward = 0;
    let done = false;
    const info: any = {};

    // Step penalty (encourage efficiency)
    reward += this.config.step_penalty;

    // ==================================================================
    // PROGRESSION REWARDS - One-time bonuses for completing each step
    // ==================================================================

    // Step 1: Detect orb grab (always rewarded)
    if (currentState.orbs_held > this.previousOrbsHeld) {
      reward += this.config.grab_orb_reward;
      info.grabbed_orb = true;

      // Check if this was an orb swap (dropped some, immediately grabbed more)
      if (this.lastDroppedOrbCount > 0 && this.previousOrbsHeld === 0) {
        const orbsPickedUp = currentState.orbs_held;

        // Only reward if picking up MORE than dropped (net positive collection)
        if (orbsPickedUp > this.lastDroppedOrbCount) {
          // Exponentially decreasing reward: more orbs picked up = diminishing returns
          // This keeps focus on transport, not just collection
          const netGain = orbsPickedUp - this.lastDroppedOrbCount;
          const swapReward = this.config.orb_swap_reward * Math.pow(0.5, netGain - 1);
          reward += swapReward;
          info.orb_swap = true;
          info.orb_swap_net_gain = netGain;
          this.consecutiveBadDrops = 0; // Reset bad drop counter on smart swap
        }
      }

      this.lastDroppedOrbCount = 0; // Reset drop tracker
    }

    // Step 2: Leave excavation zone WITH orbs (bonus for starting journey) - ONCE PER CYCLE
    if (
      !this.hasLeftExcavationWithOrbs &&  // Only if not already rewarded this cycle
      this.previousState &&
      this.previousState.zone === Zone.EXCAVATION &&
      currentState.zone !== Zone.EXCAVATION &&
      currentState.orbs_held > 0
    ) {
      reward += this.config.leave_excavation_with_orbs_reward;
      this.hasLeftExcavationWithOrbs = true;  // Mark as rewarded
      info.left_excavation_with_orbs = true;
    }

    // Step 3: Enter construction zone WITH orbs (bonus for reaching goal) - ONCE PER CYCLE
    // REMOVED obstacle zone entry reward - was causing agent to drop orbs there for quick points
    if (
      !this.hasEnteredConstructionWithOrbs &&  // Only if not already rewarded this cycle
      this.previousZone !== Zone.CONSTRUCTION &&
      this.previousZone !== Zone.TARGET_BERM &&
      (currentState.zone === Zone.CONSTRUCTION || currentState.zone === Zone.TARGET_BERM) &&
      currentState.orbs_held > 0
    ) {
      reward += this.config.enter_construction_with_orbs_reward;
      this.hasEnteredConstructionWithOrbs = true;  // Mark as rewarded
      info.entered_construction_with_orbs = true;
    }

    // Step 5: Detect orb drop/deposit with wasteful drop tracking
    if (currentState.orbs_held < this.previousOrbsHeld) {
      const orbsDropped = this.previousOrbsHeld - currentState.orbs_held;
      this.lastDroppedOrbCount = orbsDropped;

      const dropReward = this.calculateDropReward(currentState.zone);
      reward += dropReward;
      info.dropped_orb = true;
      info.drop_zone = currentState.zone;
      info.drop_reward = dropReward;

      // Track successful deposits vs bad drops
      const isGoodDeposit = currentState.zone === Zone.CONSTRUCTION || currentState.zone === Zone.TARGET_BERM;

      if (isGoodDeposit) {
        // Successful deposit - reset bad drop counter
        if (currentState.zone === Zone.CONSTRUCTION) {
          this.orbsDepositedConstruction++;
        } else if (currentState.zone === Zone.TARGET_BERM) {
          this.orbsDepositedBerm++;
        }
        this.orbsDepositedThisEpisode++;
        this.consecutiveBadDrops = 0;
      } else {
        // Bad drop (wrong zone) - increment counter
        this.consecutiveBadDrops++;
        info.bad_drop = true;
        info.consecutive_bad_drops = this.consecutiveBadDrops;

        // Apply severe penalty if too many consecutive bad drops
        if (this.consecutiveBadDrops > this.config.wasteful_drop_threshold) {
          reward += this.config.wasteful_drop_penalty;
          info.wasteful_drop_penalty = true;
        }
      }

      // Reset progression flags when orbs are dropped - start new cycle
      this.hasLeftExcavationWithOrbs = false;
      this.hasEnteredConstructionWithOrbs = false;

      // Episode ends if dropped in obstacle zone
      if (currentState.zone === Zone.OBSTACLE) {
        done = true;
        info.termination_reason = 'dropped_orb_in_obstacle_zone';
      }
    }

    // Step 6: Return to excavation zone after successful deposit
    if (
      this.previousState &&
      this.previousState.zone !== Zone.EXCAVATION &&
      currentState.zone === Zone.EXCAVATION &&
      this.previousOrbsHeld === 0 &&
      this.orbsDepositedThisEpisode > 0
    ) {
      reward += this.config.return_to_excavation_reward;
      info.returned_to_excavation = true;
    }

    // ==================================================================
    // PER-STEP REWARDS - Continuous encouragement while in each zone
    // ==================================================================

    // Zone-specific holding rewards/penalties
    if (currentState.orbs_held > 0) {
      if (currentState.zone === Zone.EXCAVATION) {
        reward += this.config.holding_orbs_in_excavation_reward;
        info.holding_in_excavation = true;
      } else if (currentState.zone === Zone.OBSTACLE) {
        reward += this.config.holding_orbs_in_obstacle_reward;
        info.holding_in_obstacle = true;
      } else if (currentState.zone === Zone.CONSTRUCTION || currentState.zone === Zone.TARGET_BERM) {
        reward += this.config.holding_orbs_in_construction_reward;
        info.holding_in_construction = true;
      }

      // Penalty for holding orbs but NOT being in construction/berm zone (creates urgency to deposit)
      // Can be disabled with disable_holding_penalty flag for early learning
      if (!this.config.disable_holding_penalty &&
          currentState.zone !== Zone.CONSTRUCTION &&
          currentState.zone !== Zone.TARGET_BERM) {
        reward += this.config.holding_orbs_outside_construction_penalty;
        info.holding_outside_construction = true;
      }
    }

    // ==================================================================
    // EXPLORATION REWARDS
    // ==================================================================

    // One-time bonus for leaving starting zone
    if (!this.hasLeftStartingZone && currentState.zone !== Zone.STARTING) {
      reward += this.config.leaving_starting_zone_bonus;
      this.hasLeftStartingZone = true;
      info.left_starting_zone = true;
    }

    // Per-step penalty for staying in starting zone
    if (currentState.zone === Zone.STARTING) {
      reward += this.config.stuck_in_starting_zone_penalty;
      info.stuck_in_starting = true;
    }

    // Distance traveled reward
    if (this.previousState) {
      const dx = currentState.position_x - this.previousState.position_x;
      const dy = currentState.position_y - this.previousState.position_y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const distanceReward = distance * this.config.distance_traveled_reward;
      reward += distanceReward;
      if (distanceReward > 0) {
        info.distance_traveled = distance;
      }
    }

    // ==================================================================
    // SMOOTH CONTROL REWARDS & OSCILLATION PENALTIES
    // ==================================================================

    // Track speed for oscillation detection
    this.speedHistory.push(currentState.speed);
    if (this.speedHistory.length > this.config.oscillation_window) {
      this.speedHistory.shift();
    }

    // Detect rapid oscillation (e.g., 1, -1, 1, -1)
    if (this.speedHistory.length >= this.config.oscillation_window) {
      const isOscillating = this.detectSpeedOscillation();
      if (isOscillating) {
        reward += this.config.speed_oscillation_penalty;
        info.speed_oscillating = true;
      }
    }

    if (this.previousState && Math.abs(currentState.speed) > this.config.idle_speed_threshold) {
      const smoothReward = this.calculateSmoothControlReward(this.previousState, currentState);
      reward += smoothReward;
      if (smoothReward > 0) {
        info.smooth_control = true;
      }

      // Reward for maintaining consistent speed (not constantly adjusting throttle)
      const speedChange = Math.abs(currentState.speed - this.previousState.speed);
      if (speedChange <= this.config.maintaining_speed_threshold) {
        reward += this.config.maintaining_speed_reward;
        info.maintaining_speed = true;
      }

      // Reward for driving at high speed when moving (efficiency)
      if (Math.abs(currentState.speed) >= this.config.high_speed_threshold) {
        reward += this.config.high_speed_reward;
        info.high_speed = true;
      }

      // Reward for maintaining consistent heading (smooth straight-line driving)
      let headingChange = Math.abs(currentState.heading - this.previousState.heading);
      // Handle wraparound (e.g., 359° to 1° is a 2° change, not 358°)
      if (headingChange > 180) {
        headingChange = 360 - headingChange;
      }
      if (headingChange <= this.config.maintaining_heading_threshold) {
        reward += this.config.maintaining_heading_reward;
        info.maintaining_heading = true;
      }
    }

    // ==================================================================
    // IDLE PENALTY
    // ==================================================================

    if (Math.abs(currentState.speed) < this.config.idle_speed_threshold) {
      reward += this.config.idle_penalty;
      info.idle = true;
    }

    // ==================================================================
    // FORWARD/BACKWARD MOVEMENT PENALTIES/REWARDS
    // ==================================================================

    // Penalize backward movement, reward forward movement
    if (currentState.speed < -this.config.idle_speed_threshold) {
      // Moving backward
      reward += this.config.backward_movement_penalty;
      info.moving_backward = true;
    } else if (currentState.speed > this.config.idle_speed_threshold) {
      // Moving forward
      reward += this.config.forward_movement_reward;
      info.moving_forward = true;
    }

    // ==================================================================
    // SHAPING REWARDS (optional guidance)
    // ==================================================================

    if (this.config.use_shaping_rewards && this.previousState) {
      const shapingReward = this.calculateShapingReward(this.previousState, currentState);
      reward += shapingReward;
    }

    // ==================================================================
    // UPDATE STATE TRACKING
    // ==================================================================

    this.previousState = currentState;
    this.previousOrbsHeld = currentState.orbs_held;
    this.previousZone = currentState.zone;
    this.episodeReward += reward;

    info.episode_reward = this.episodeReward;
    info.orbs_deposited = this.orbsDepositedThisEpisode;
    info.orbs_deposited_construction = this.orbsDepositedConstruction;
    info.orbs_deposited_berm = this.orbsDepositedBerm;

    return { reward, done, info };
  }

  /**
   * Calculate reward for collision (called externally)
   */
  getCollisionReward(): { reward: number; done: boolean } {
    return {
      reward: this.config.collision_penalty,
      done: true
    };
  }

  /**
   * Get current episode statistics
   */
  getEpisodeStats() {
    return {
      total_reward: this.episodeReward,
      orbs_deposited: this.orbsDepositedThisEpisode,
      orbs_deposited_construction: this.orbsDepositedConstruction,
      orbs_deposited_berm: this.orbsDepositedBerm
    };
  }

  // ==================== Private Methods ====================

  private getCurrentState(): RewardState {
    const orbs = this.environment?.diggingField?.diggableObjects || [];
    const orbs_held = orbs.filter(orb => orb.isPickedUp).length;

    const state = this.environment?.physicsEngine?.getRoverState();
    const position_x = state?.x ?? 0;
    const position_y = state?.y ?? 0;

    // Get nearest orb distance (for shaping)
    let nearest_orb_distance = Infinity;
    if (this.environment != null) {
      const env = this.environment;
      for (const orb of orbs) {
        if (orb.isPickedUp) continue;
        const orbX = env.metersToPixels(orb.x_meters);
        const orbY = env.environment_height_px - env.metersToPixels(orb.y_meters);
        const dx = orbX - position_x;
        const dy = orbY - position_y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearest_orb_distance) {
          nearest_orb_distance = dist;
        }
      }
    }

    // Get construction zone distance (for shaping)
    let construction_zone_distance = Infinity;
    if (this.environment != null) {
      const env = this.environment;
      const constructionZoneCenterX =
        (env.zoneDisplay.excavationZone_width_meters + env.environment_width_meters) / 2;
      const constructionZoneCenterY = env.environment_height_meters / 2;
      const targetX = env.metersToPixels(constructionZoneCenterX);
      const targetY = env.environment_height_px - env.metersToPixels(constructionZoneCenterY);
      const dx = targetX - position_x;
      const dy = targetY - position_y;
      construction_zone_distance = Math.sqrt(dx * dx + dy * dy);
    }

    // Get rover speed and heading (use currentSpeed for rounded value)
    const speed = this.environment?.rover?.currentSpeed ?? 0;
    const heading = this.environment?.rover?.currentHeading ?? 0;

    return {
      orbs_held,
      zone: this.environment?.currentZone ?? Zone.NONE,
      position_x,
      position_y,
      nearest_orb_distance,
      construction_zone_distance,
      speed,
      heading
    };
  }

  private calculateDropReward(zone: Zone): number {
    switch (zone) {
      case Zone.TARGET_BERM:
        return this.config.deposit_berm_reward;
      case Zone.CONSTRUCTION:
        return this.config.deposit_construction_reward;
      case Zone.EXCAVATION:
        return this.config.drop_excavation_penalty;
      case Zone.OBSTACLE:
        return this.config.drop_obstacle_penalty;
      case Zone.STARTING:
        return this.config.drop_starting_penalty;
      case Zone.NONE:
        return this.config.drop_none_penalty;
      default:
        return this.config.drop_none_penalty;
    }
  }

  private calculateShapingReward(prevState: RewardState, currState: RewardState): number {
    let shapingReward = 0;

    // If not holding orbs, reward moving toward nearest orb
    if (currState.orbs_held === 0 && currState.nearest_orb_distance !== Infinity) {
      const prevDist = prevState.nearest_orb_distance;
      const currDist = currState.nearest_orb_distance;

      if (currDist < prevDist) {
        // Moving closer to orb
        shapingReward += this.config.shaping_reward_scale;
      }
    }

    // If holding orbs, reward moving toward construction zone
    if (currState.orbs_held > 0) {
      const prevDist = prevState.construction_zone_distance;
      const currDist = currState.construction_zone_distance;

      if (currDist < prevDist) {
        // Moving closer to construction zone
        shapingReward += this.config.shaping_reward_scale;
      }
    }

    return shapingReward;
  }

  private calculateSmoothControlReward(prevState: RewardState, currState: RewardState): number {
    let smoothReward = 0;

    // Calculate change in speed (acceleration)
    const speedChange = Math.abs(currState.speed - prevState.speed);
    if (speedChange <= this.config.smooth_threshold) {
      smoothReward += this.config.smooth_acceleration_reward;
    }

    // Calculate change in heading (turning)
    // Handle wraparound (e.g., 359° to 1° is a 2° change, not 358°)
    let headingChange = Math.abs(currState.heading - prevState.heading);
    if (headingChange > 180) {
      headingChange = 360 - headingChange;
    }
    // Normalize to 0-1 scale (180° = 0.5)
    const normalizedHeadingChange = headingChange / 360;

    if (normalizedHeadingChange <= this.config.smooth_threshold) {
      smoothReward += this.config.smooth_turning_reward;
    }

    return smoothReward;
  }

  private detectSpeedOscillation(): boolean {
    // Detect if speed is alternating between forward and backward
    // Pattern: positive -> negative -> positive (or vice versa)
    if (this.speedHistory.length < 3) {
      return false;
    }

    // Check if signs are alternating
    let signChanges = 0;
    for (let i = 1; i < this.speedHistory.length; i++) {
      const prevSign = Math.sign(this.speedHistory[i - 1]);
      const currSign = Math.sign(this.speedHistory[i]);

      // Count sign changes (excluding near-zero speeds)
      if (Math.abs(this.speedHistory[i - 1]) > 0.1 &&
          Math.abs(this.speedHistory[i]) > 0.1 &&
          prevSign !== currSign && prevSign !== 0 && currSign !== 0) {
        signChanges++;
      }
    }

    // If we have alternating signs (oscillation), penalize
    // For window of 3, we expect 2 sign changes for full oscillation
    return signChanges >= (this.speedHistory.length - 1);
  }
}
