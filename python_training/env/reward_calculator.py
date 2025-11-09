"""
ML Reward Calculator - Port of TypeScript ml-reward.ts
Calculates rewards based on state transitions for reinforcement learning.
"""

from typing import Dict, Any, Tuple, Optional, List
from enum import Enum
import math

from .ml_config import MLConfig, DEFAULT_ML_CONFIG


class Zone(Enum):
    """Environment zones - must match lunabotics_env.py"""
    STARTING = 0
    EXCAVATION = 1
    OBSTACLE = 2
    CONSTRUCTION = 3
    TARGET_BERM = 4
    NONE = 5


class RewardState:
    """State representation for reward calculation"""
    def __init__(
        self,
        orbs_held: int = 0,
        zone: Zone = Zone.NONE,
        position_x: float = 0.0,
        position_y: float = 0.0,
        nearest_orb_distance: float = float('inf'),
        construction_zone_distance: float = float('inf'),
        speed: float = 0.0,
        heading: float = 0.0
    ):
        self.orbs_held = orbs_held
        self.zone = zone
        self.position_x = position_x
        self.position_y = position_y
        self.nearest_orb_distance = nearest_orb_distance
        self.construction_zone_distance = construction_zone_distance
        self.speed = speed
        self.heading = heading


class RewardCalculator:
    """
    Calculates rewards for the Lunabotics ML training environment.
    Ports all reward logic from TypeScript ml-reward.ts including:
    - Progression tracking (leaving excavation, entering construction, etc.)
    - Oscillation detection for speed
    - Smooth control rewards
    - Wasteful drop tracking
    """

    def __init__(self, config: Optional[MLConfig] = None):
        """Initialize reward calculator with configuration"""
        self.config = config if config is not None else DEFAULT_ML_CONFIG

        # State tracking
        self.previous_state: Optional[RewardState] = None
        self.episode_reward: float = 0.0
        self.previous_orbs_held: int = 0
        self.orbs_deposited_this_episode: int = 0
        self.orbs_deposited_construction: int = 0
        self.orbs_deposited_berm: int = 0

        # Progression tracking
        self.has_left_starting_zone: bool = False
        self.previous_zone: Optional[Zone] = None
        self.has_left_excavation_with_orbs: bool = False
        self.has_entered_construction_with_orbs: bool = False

        # Oscillation detection
        self.speed_history: List[float] = []

        # Orb management tracking
        self.consecutive_bad_drops: int = 0
        self.last_dropped_orb_count: int = 0

    def set_config(self, config: MLConfig) -> None:
        """Update configuration"""
        self.config = config

    def reset_episode(self) -> None:
        """Reset reward tracking for new episode"""
        self.previous_state = None
        self.episode_reward = 0.0
        self.previous_orbs_held = 0
        self.orbs_deposited_this_episode = 0
        self.orbs_deposited_construction = 0
        self.orbs_deposited_berm = 0
        self.has_left_starting_zone = False
        self.previous_zone = None
        self.has_left_excavation_with_orbs = False
        self.has_entered_construction_with_orbs = False
        self.speed_history = []
        self.consecutive_bad_drops = 0
        self.last_dropped_orb_count = 0

    def calculate_reward(
        self,
        current_state: RewardState,
        prev_state: Optional[RewardState] = None,
        action: Optional[Any] = None,
        zone_changed: bool = False
    ) -> Tuple[float, bool, Dict[str, Any]]:
        """
        Calculate reward for current step with progression-based structure.

        Args:
            current_state: Current state of the environment
            prev_state: Previous state (optional, uses internal tracking if None)
            action: Action taken (optional, for future use)
            zone_changed: Whether zone changed this step (optional optimization)

        Returns:
            Tuple of (reward, done, info_dict)
        """
        # Use provided previous state or internal tracking
        if prev_state is None:
            prev_state = self.previous_state

        reward = 0.0
        done = False
        info: Dict[str, Any] = {}

        # Step penalty (encourage efficiency)
        reward += self.config.step_penalty

        # ==================================================================
        # PROGRESSION REWARDS - One-time bonuses for completing each step
        # ==================================================================

        # Step 1: Detect orb grab (always rewarded)
        if current_state.orbs_held > self.previous_orbs_held:
            reward += self.config.grab_orb_reward
            info['grabbed_orb'] = True

            # Check if this was an orb swap (dropped some, immediately grabbed more)
            if self.last_dropped_orb_count > 0 and self.previous_orbs_held == 0:
                orbs_picked_up = current_state.orbs_held

                # Only reward if picking up MORE than dropped (net positive collection)
                if orbs_picked_up > self.last_dropped_orb_count:
                    # Exponentially decreasing reward: more orbs picked up = diminishing returns
                    # This keeps focus on transport, not just collection
                    net_gain = orbs_picked_up - self.last_dropped_orb_count
                    swap_reward = self.config.orb_swap_reward * math.pow(0.5, net_gain - 1)
                    reward += swap_reward
                    info['orb_swap'] = True
                    info['orb_swap_net_gain'] = net_gain
                    self.consecutive_bad_drops = 0  # Reset bad drop counter on smart swap

            self.last_dropped_orb_count = 0  # Reset drop tracker

        # Step 2: Leave excavation zone WITH orbs (bonus for starting journey) - ONCE PER CYCLE
        if (
            not self.has_left_excavation_with_orbs and  # Only if not already rewarded this cycle
            prev_state is not None and
            prev_state.zone == Zone.EXCAVATION and
            current_state.zone != Zone.EXCAVATION and
            current_state.orbs_held > 0
        ):
            reward += self.config.leave_excavation_with_orbs_reward
            self.has_left_excavation_with_orbs = True  # Mark as rewarded
            info['left_excavation_with_orbs'] = True

        # Step 3: Enter construction zone WITH orbs (bonus for reaching goal) - ONCE PER CYCLE
        # REMOVED obstacle zone entry reward - was causing agent to drop orbs there for quick points
        if (
            not self.has_entered_construction_with_orbs and  # Only if not already rewarded this cycle
            self.previous_zone not in (Zone.CONSTRUCTION, Zone.TARGET_BERM) and
            current_state.zone in (Zone.CONSTRUCTION, Zone.TARGET_BERM) and
            current_state.orbs_held > 0
        ):
            reward += self.config.enter_construction_with_orbs_reward
            self.has_entered_construction_with_orbs = True  # Mark as rewarded
            info['entered_construction_with_orbs'] = True

        # Step 5: Detect orb drop/deposit with wasteful drop tracking
        if current_state.orbs_held < self.previous_orbs_held:
            orbs_dropped = self.previous_orbs_held - current_state.orbs_held
            self.last_dropped_orb_count = orbs_dropped

            drop_reward = self._calculate_drop_reward(current_state.zone)
            reward += drop_reward
            info['dropped_orb'] = True
            info['drop_zone'] = current_state.zone.name
            info['drop_reward'] = drop_reward

            # Track successful deposits vs bad drops
            is_good_deposit = current_state.zone in (Zone.CONSTRUCTION, Zone.TARGET_BERM)

            if is_good_deposit:
                # Successful deposit - reset bad drop counter
                if current_state.zone == Zone.CONSTRUCTION:
                    self.orbs_deposited_construction += 1
                elif current_state.zone == Zone.TARGET_BERM:
                    self.orbs_deposited_berm += 1
                self.orbs_deposited_this_episode += 1
                self.consecutive_bad_drops = 0
            else:
                # Bad drop (wrong zone) - increment counter
                self.consecutive_bad_drops += 1
                info['bad_drop'] = True
                info['consecutive_bad_drops'] = self.consecutive_bad_drops

                # Apply severe penalty if too many consecutive bad drops
                if self.consecutive_bad_drops > self.config.wasteful_drop_threshold:
                    reward += self.config.wasteful_drop_penalty
                    info['wasteful_drop_penalty'] = True

            # Reset progression flags when orbs are dropped - start new cycle
            self.has_left_excavation_with_orbs = False
            self.has_entered_construction_with_orbs = False

            # Episode ends if dropped in obstacle zone
            if current_state.zone == Zone.OBSTACLE:
                done = True
                info['termination_reason'] = 'dropped_orb_in_obstacle_zone'

        # Step 6: Return to excavation zone after successful deposit
        if (
            prev_state is not None and
            prev_state.zone != Zone.EXCAVATION and
            current_state.zone == Zone.EXCAVATION and
            self.previous_orbs_held == 0 and
            self.orbs_deposited_this_episode > 0
        ):
            reward += self.config.return_to_excavation_reward
            info['returned_to_excavation'] = True

        # ==================================================================
        # PER-STEP REWARDS - Continuous encouragement while in each zone
        # ==================================================================

        # Zone-specific holding rewards/penalties
        if current_state.orbs_held > 0:
            if current_state.zone == Zone.EXCAVATION:
                reward += self.config.holding_orbs_in_excavation_reward
                info['holding_in_excavation'] = True
            elif current_state.zone == Zone.OBSTACLE:
                reward += self.config.holding_orbs_in_obstacle_reward
                info['holding_in_obstacle'] = True
            elif current_state.zone in (Zone.CONSTRUCTION, Zone.TARGET_BERM):
                reward += self.config.holding_orbs_in_construction_reward
                info['holding_in_construction'] = True

            # Penalty for holding orbs but NOT being in construction/berm zone (creates urgency to deposit)
            # Can be disabled with disable_holding_penalty flag for early learning
            if (
                not self.config.disable_holding_penalty and
                current_state.zone not in (Zone.CONSTRUCTION, Zone.TARGET_BERM)
            ):
                reward += self.config.holding_orbs_outside_construction_penalty
                info['holding_outside_construction'] = True

        # ==================================================================
        # EXPLORATION REWARDS
        # ==================================================================

        # One-time bonus for leaving starting zone
        if not self.has_left_starting_zone and current_state.zone != Zone.STARTING:
            reward += self.config.leaving_starting_zone_bonus
            self.has_left_starting_zone = True
            info['left_starting_zone'] = True

        # Per-step penalty for staying in starting zone
        if current_state.zone == Zone.STARTING:
            reward += self.config.stuck_in_starting_zone_penalty
            info['stuck_in_starting'] = True

        # Distance traveled reward
        if prev_state is not None:
            dx = current_state.position_x - prev_state.position_x
            dy = current_state.position_y - prev_state.position_y
            distance = math.sqrt(dx * dx + dy * dy)
            distance_reward = distance * self.config.distance_traveled_reward
            reward += distance_reward
            if distance_reward > 0:
                info['distance_traveled'] = distance

        # ==================================================================
        # SMOOTH CONTROL REWARDS & OSCILLATION PENALTIES
        # ==================================================================

        # Track speed for oscillation detection
        self.speed_history.append(current_state.speed)
        if len(self.speed_history) > self.config.oscillation_window:
            self.speed_history.pop(0)

        # Detect rapid oscillation (e.g., 1, -1, 1, -1)
        if len(self.speed_history) >= self.config.oscillation_window:
            is_oscillating = self._detect_speed_oscillation()
            if is_oscillating:
                reward += self.config.speed_oscillation_penalty
                info['speed_oscillating'] = True

        if prev_state is not None and abs(current_state.speed) > self.config.idle_speed_threshold:
            smooth_reward = self._calculate_smooth_control_reward(prev_state, current_state)
            reward += smooth_reward
            if smooth_reward > 0:
                info['smooth_control'] = True

            # Reward for maintaining consistent speed (not constantly adjusting throttle)
            speed_change = abs(current_state.speed - prev_state.speed)
            if speed_change <= self.config.maintaining_speed_threshold:
                reward += self.config.maintaining_speed_reward
                info['maintaining_speed'] = True

            # Reward for driving at high speed when moving (efficiency)
            if abs(current_state.speed) >= self.config.high_speed_threshold:
                reward += self.config.high_speed_reward
                info['high_speed'] = True

            # Reward for maintaining consistent heading (smooth straight-line driving)
            heading_change = abs(current_state.heading - prev_state.heading)
            # Handle wraparound (e.g., 359° to 1° is a 2° change, not 358°)
            if heading_change > 180:
                heading_change = 360 - heading_change
            if heading_change <= self.config.maintaining_heading_threshold:
                reward += self.config.maintaining_heading_reward
                info['maintaining_heading'] = True

        # ==================================================================
        # IDLE PENALTY
        # ==================================================================

        if abs(current_state.speed) < self.config.idle_speed_threshold:
            reward += self.config.idle_penalty
            info['idle'] = True

        # ==================================================================
        # FORWARD/BACKWARD MOVEMENT PENALTIES/REWARDS
        # ==================================================================

        # Penalize backward movement, reward forward movement
        if current_state.speed < -self.config.idle_speed_threshold:
            # Moving backward
            reward += self.config.backward_movement_penalty
            info['moving_backward'] = True
        elif current_state.speed > self.config.idle_speed_threshold:
            # Moving forward
            reward += self.config.forward_movement_reward
            info['moving_forward'] = True

        # ==================================================================
        # SHAPING REWARDS (optional guidance)
        # ==================================================================

        if self.config.use_shaping_rewards and prev_state is not None:
            shaping_reward = self._calculate_shaping_reward(prev_state, current_state)
            reward += shaping_reward

        # ==================================================================
        # UPDATE STATE TRACKING
        # ==================================================================

        self.previous_state = current_state
        self.previous_orbs_held = current_state.orbs_held
        self.previous_zone = current_state.zone
        self.episode_reward += reward

        info['episode_reward'] = self.episode_reward
        info['orbs_deposited'] = self.orbs_deposited_this_episode
        info['orbs_deposited_construction'] = self.orbs_deposited_construction
        info['orbs_deposited_berm'] = self.orbs_deposited_berm

        return reward, done, info

    def get_collision_reward(self) -> Tuple[float, bool]:
        """
        Calculate reward for collision (called externally).

        Returns:
            Tuple of (reward, done)
        """
        return self.config.collision_penalty, True

    def get_episode_stats(self) -> Dict[str, Any]:
        """
        Get current episode statistics.

        Returns:
            Dictionary of episode statistics
        """
        return {
            'total_reward': self.episode_reward,
            'orbs_deposited': self.orbs_deposited_this_episode,
            'orbs_deposited_construction': self.orbs_deposited_construction,
            'orbs_deposited_berm': self.orbs_deposited_berm
        }

    # ==================== Private Methods ====================

    def _calculate_drop_reward(self, zone: Zone) -> float:
        """Calculate reward/penalty for dropping orbs in a zone"""
        zone_rewards = {
            Zone.TARGET_BERM: self.config.deposit_berm_reward,
            Zone.CONSTRUCTION: self.config.deposit_construction_reward,
            Zone.EXCAVATION: self.config.drop_excavation_penalty,
            Zone.OBSTACLE: self.config.drop_obstacle_penalty,
            Zone.STARTING: self.config.drop_starting_penalty,
            Zone.NONE: self.config.drop_none_penalty,
        }
        return zone_rewards.get(zone, self.config.drop_none_penalty)

    def _calculate_shaping_reward(
        self,
        prev_state: RewardState,
        curr_state: RewardState
    ) -> float:
        """Calculate potential-based shaping reward"""
        shaping_reward = 0.0

        # If not holding orbs, reward moving toward nearest orb
        if curr_state.orbs_held == 0 and curr_state.nearest_orb_distance != float('inf'):
            prev_dist = prev_state.nearest_orb_distance
            curr_dist = curr_state.nearest_orb_distance

            if curr_dist < prev_dist:
                # Moving closer to orb
                shaping_reward += self.config.shaping_reward_scale

        # If holding orbs, reward moving toward construction zone
        if curr_state.orbs_held > 0:
            prev_dist = prev_state.construction_zone_distance
            curr_dist = curr_state.construction_zone_distance

            if curr_dist < prev_dist:
                # Moving closer to construction zone
                shaping_reward += self.config.shaping_reward_scale

        return shaping_reward

    def _calculate_smooth_control_reward(
        self,
        prev_state: RewardState,
        curr_state: RewardState
    ) -> float:
        """Calculate reward for smooth control actions"""
        smooth_reward = 0.0

        # Calculate change in speed (acceleration)
        speed_change = abs(curr_state.speed - prev_state.speed)
        if speed_change <= self.config.smooth_threshold:
            smooth_reward += self.config.smooth_acceleration_reward

        # Calculate change in heading (turning)
        # Handle wraparound (e.g., 359° to 1° is a 2° change, not 358°)
        heading_change = abs(curr_state.heading - prev_state.heading)
        if heading_change > 180:
            heading_change = 360 - heading_change
        # Normalize to 0-1 scale (180° = 0.5)
        normalized_heading_change = heading_change / 360

        if normalized_heading_change <= self.config.smooth_threshold:
            smooth_reward += self.config.smooth_turning_reward

        return smooth_reward

    def _detect_speed_oscillation(self) -> bool:
        """
        Detect if speed is alternating between forward and backward.
        Pattern: positive -> negative -> positive (or vice versa)
        """
        if len(self.speed_history) < 3:
            return False

        # Check if signs are alternating
        sign_changes = 0
        for i in range(1, len(self.speed_history)):
            prev_sign = math.copysign(1, self.speed_history[i - 1])
            curr_sign = math.copysign(1, self.speed_history[i])

            # Count sign changes (excluding near-zero speeds)
            if (
                abs(self.speed_history[i - 1]) > 0.1 and
                abs(self.speed_history[i]) > 0.1 and
                prev_sign != curr_sign and prev_sign != 0 and curr_sign != 0
            ):
                sign_changes += 1

        # If we have alternating signs (oscillation), penalize
        # For window of 3, we expect 2 sign changes for full oscillation
        return sign_changes >= (len(self.speed_history) - 1)
