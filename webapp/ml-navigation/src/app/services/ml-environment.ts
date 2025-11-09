// ML Environment Service - Gym-like interface for the simulation

import { Injectable, inject } from '@angular/core';
import { EnvironmentComponent } from '../../environment/environment';
import { MLStateService } from './ml-state';
import { MLRewardService } from './ml-reward';
import { ResetTrigger } from './reset-trigger';
import { Subscription } from 'rxjs';
import {
  MLAction,
  MLStepResult,
  MLStepInfo,
  MLConfig,
  DEFAULT_ML_CONFIG
} from '../interfaces/ml-types';

@Injectable({
  providedIn: 'root'
})
export class MLEnvironmentService {
  private environment: EnvironmentComponent | null = null;
  private stateService = inject(MLStateService);
  private rewardService = inject(MLRewardService);
  private resetTrigger = inject(ResetTrigger);

  setEnvironment(env: EnvironmentComponent) {
    this.environment = env;
    this.stateService.setEnvironment(env);
    this.rewardService.setEnvironment(env);
  }

  private config: MLConfig = DEFAULT_ML_CONFIG;
  private episodeSteps: number = 0;
  private resetSubscription?: Subscription;
  private collisionOccurred: boolean = false;
  private lastDigAction: number = 0; // Track previous dig action to detect toggles

  constructor() {
    // Subscribe to collision resets
    this.resetSubscription = this.resetTrigger.reset$.subscribe(() => {
      this.collisionOccurred = true;
    });
  }

  /**
   * Update environment configuration
   */
  setConfig(config: Partial<MLConfig>) {
    this.config = { ...this.config, ...config };
    this.rewardService.setConfig(config);
  }

  /**
   * Reset environment to initial state
   * Returns initial observation
   */
  reset(): number[] {
    // Reset reward service
    this.rewardService.resetEpisode();

    // Trigger physics reset (will randomize rover position and regenerate obstacles/orbs)
    this.resetTrigger.triggerReset();

    // Reset episode tracking AFTER physics reset to avoid catching reset collision
    this.episodeSteps = 0;
    this.lastDigAction = 0;

    // Clear collision flag after a small delay to let reset physics settle
    setTimeout(() => {
      this.collisionOccurred = false;
    }, 100);

    // Wait a frame for physics to settle, then return initial observation
    // In practice, Python will call step() immediately after reset()
    return this.stateService.getObservationArray();
  }

  /**
   * Take a step in the environment with the given action
   * Returns observation, reward, done, and info
   */
  step(action: MLAction): MLStepResult {
    this.episodeSteps++;

    // Apply action to environment
    this.applyAction(action);

    // Let physics update (this happens in the main game loop)
    // In a real setup, you might wait for next frame or step physics manually

    // Check for collision
    let done = false;
    let reward = 0;

    if (this.collisionOccurred) {
      const collisionResult = this.rewardService.getCollisionReward();
      reward = collisionResult.reward;
      done = true;
      console.log(`[ML Environment] COLLISION DETECTED! Reward: ${reward}, Episode Steps: ${this.episodeSteps}`);
      this.collisionOccurred = false; // Reset flag
    } else {
      // Calculate reward for normal step
      const rewardResult = this.rewardService.calculateReward();
      reward = rewardResult.reward;
      done = rewardResult.done || false;

      if (this.episodeSteps <= 2) {
        console.log(`[ML Environment] Step ${this.episodeSteps}: Reward: ${reward.toFixed(2)}, Done: ${done}`);
      }
    }

    // Check for max episode length
    if (this.episodeSteps >= this.config.max_episode_steps) {
      done = true;
    }

    // Get current observation
    const observation = this.stateService.getObservationArray();

    // Build info object
    const stats = this.rewardService.getEpisodeStats();
    const info: MLStepInfo = {
      episode_length: this.episodeSteps,
      orbs_collected: stats.orbs_deposited,
      orbs_deposited_construction: stats.orbs_deposited_construction,
      orbs_deposited_berm: stats.orbs_deposited_berm,
      collision_occurred: this.collisionOccurred,
      zone: this.environment?.currentZone.toString() ?? 'none',
      total_reward: stats.total_reward
    };

    return {
      observation,
      reward,
      done,
      info
    };
  }

  /**
   * Get current state without taking a step
   */
  getState(): number[] {
    return this.stateService.getObservationArray();
  }

  /**
   * Get episode statistics
   */
  getEpisodeInfo(): MLStepInfo {
    const stats = this.rewardService.getEpisodeStats();
    return {
      episode_length: this.episodeSteps,
      orbs_collected: stats.orbs_deposited,
      orbs_deposited_construction: stats.orbs_deposited_construction,
      orbs_deposited_berm: stats.orbs_deposited_berm,
      collision_occurred: this.collisionOccurred,
      zone: this.environment?.currentZone.toString() ?? 'none',
      total_reward: stats.total_reward
    };
  }

  /**
   * Set simulation timescale for training speed
   */
  setTimescale(timescale: number) {
    if (this.environment?.physicsEngine) {
      this.environment.physicsEngine.setTimescale(timescale);
    }
  }

  // ==================== Private Methods ====================

  /**
   * Apply ML action to the environment
   */
  private applyAction(action: MLAction) {
    if (!this.environment) return;

    // Apply speed (-1 to 1) as target speed
    // The rover will gradually accelerate/decelerate toward this target using maxSpeedChangeRate (0.05 per frame)
    // This prevents instant speed changes and makes movement smoother
    if (this.environment.rover) {
      this.environment.rover.targetSpeed = action.speed;
    }

    // Apply turn_rate (-1 to 1 → direct angular velocity control)
    // -1 = turn left (counterclockwise), +1 = turn right (clockwise)
    if (this.environment.rover) {
      this.environment.rover.mlTurnRate = action.turn_rate;
    }

    // Apply dig action (toggle when crossing 0.5 threshold)
    // Only toggle if action crosses threshold from previous value
    const shouldDig = action.dig_action > 0.5 ? 1 : 0;
    const prevShouldDig = this.lastDigAction > 0.5 ? 1 : 0;

    if (shouldDig !== prevShouldDig && shouldDig === 1) {
      // Trigger dig toggle (press B)
      this.toggleDigMode();
    }

    this.lastDigAction = action.dig_action;
  }

  /**
   * Toggle dig mode (equivalent to pressing B key)
   */
  private toggleDigMode() {
    if (!this.environment?.diggingField) return;

    const currentDigMode = this.environment.diggingField.digModeEnabled;

    if (!currentDigMode) {
      // Trying to grab
      const canGrab = this.environment.diggingField.canGrab();
      const hasGrabbed = this.environment.diggingField.hasGrabbedOrbs();

      if (canGrab && !hasGrabbed) {
        this.environment.diggingField.setDigMode(true);
      }
    } else {
      // Release
      this.environment.diggingField.setDigMode(false);
    }
  }

  /**
   * Cleanup
   */
  ngOnDestroy() {
    if (this.resetSubscription) {
      this.resetSubscription.unsubscribe();
    }
  }
}
