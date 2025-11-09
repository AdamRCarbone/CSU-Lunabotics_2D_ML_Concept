"""
Reward Calculator for Lunabotics ML Training
Matches TypeScript reward system
"""

from typing import Dict, Any
from enum import Enum


class Zone(Enum):
    """Environment zones"""
    STARTING = 0
    EXCAVATION = 1
    OBSTACLE = 2
    CONSTRUCTION = 3
    TARGET_BERM = 4
    NONE = 5


class RewardCalculator:
    """
    Calculate rewards for RL training.
    Matches the reward structure from TypeScript training system.
    """

    def __init__(self, config: Dict[str, float]):
        """
        Initialize reward calculator with config.

        Args:
            config: Dictionary with reward values:
                - time_step: Small negative reward each step
                - reach_excavation_zone: Reward for reaching excavation
                - reach_construction_zone_with_orb: Reward for reaching construction with orbs
                - collect_orb: Reward for collecting an orb
                - deposit_orb: Reward for depositing an orb
                - collision_obstacle: Penalty for obstacle collision
                - collision_wall: Penalty for wall collision
                - progress_toward_excavation: Small reward for moving toward excavation
                - progress_toward_construction: Small reward for moving toward construction with orbs
        """
        self.config = config

    def calculate_reward(
        self,
        current_state: Dict[str, Any],
        previous_state: Dict[str, Any],
        action: Dict[str, Any]
    ) -> float:
        """
        Calculate reward for current step.

        Args:
            current_state: Current environment state containing:
                - rover_x, rover_y: Position
                - current_zone: Zone enum
                - num_orbs_held: Number of orbs currently held
                - collided_with_obstacle: Boolean
                - collided_with_wall: Boolean
            previous_state: Previous environment state (same keys)
            action: Action taken (not used currently but kept for compatibility)

        Returns:
            Total reward for this step
        """
        reward = 0.0

        # Time penalty (encourage faster completion)
        reward += self.config.get('time_step', -0.01)

        # Zone progression rewards
        curr_zone = current_state['current_zone']
        prev_zone = previous_state.get('current_zone', Zone.NONE)

        # Reached excavation zone
        if curr_zone == Zone.EXCAVATION and prev_zone != Zone.EXCAVATION:
            reward += self.config.get('reach_excavation_zone', 10.0)

        # Reached construction zone with orbs
        if (curr_zone == Zone.CONSTRUCTION and
            prev_zone != Zone.CONSTRUCTION and
            current_state['num_orbs_held'] > 0):
            reward += self.config.get('reach_construction_zone_with_orb', 20.0)

        # Orb collection
        prev_orbs = previous_state.get('num_orbs_held', 0)
        curr_orbs = current_state['num_orbs_held']
        if curr_orbs > prev_orbs:
            orbs_collected = curr_orbs - prev_orbs
            reward += self.config.get('collect_orb', 15.0) * orbs_collected

        # Orb deposit
        prev_deposited = previous_state.get('orbs_deposited', 0)
        curr_deposited = current_state.get('orbs_deposited', 0)
        if curr_deposited > prev_deposited:
            orbs_deposited = curr_deposited - prev_deposited
            reward += self.config.get('deposit_orb', 50.0) * orbs_deposited

        # Collision penalties
        if current_state.get('collided_with_obstacle', False):
            reward += self.config.get('collision_obstacle', -10.0)

        if current_state.get('collided_with_wall', False):
            reward += self.config.get('collision_wall', -5.0)

        # Progress shaping rewards
        # Toward excavation when not holding orbs
        if curr_orbs == 0 and curr_zone != Zone.EXCAVATION:
            excavation_center = (1.25, 1.5)  # Center of excavation zone
            curr_dist = self._distance_to_point(
                current_state['rover_x'],
                current_state['rover_y'],
                excavation_center[0],
                excavation_center[1]
            )
            prev_dist = self._distance_to_point(
                previous_state.get('rover_x', current_state['rover_x']),
                previous_state.get('rover_y', current_state['rover_y']),
                excavation_center[0],
                excavation_center[1]
            )
            delta_dist = prev_dist - curr_dist
            reward += delta_dist * self.config.get('progress_toward_excavation', 1.0)

        # Toward construction when holding orbs
        if curr_orbs > 0:
            construction_center = (8.38, 0.75)  # Center of construction zone
            curr_dist = self._distance_to_point(
                current_state['rover_x'],
                current_state['rover_y'],
                construction_center[0],
                construction_center[1]
            )
            prev_dist = self._distance_to_point(
                previous_state.get('rover_x', current_state['rover_x']),
                previous_state.get('rover_y', current_state['rover_y']),
                construction_center[0],
                construction_center[1]
            )
            delta_dist = prev_dist - curr_dist
            reward += delta_dist * self.config.get('progress_toward_construction', 2.0)

        return reward

    @staticmethod
    def _distance_to_point(x1: float, y1: float, x2: float, y2: float) -> float:
        """Calculate Euclidean distance between two points"""
        return ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5

    @classmethod
    def get_default_config(cls) -> Dict[str, float]:
        """Get default reward configuration"""
        return {
            'time_step': -0.01,
            'reach_excavation_zone': 10.0,
            'reach_construction_zone_with_orb': 20.0,
            'collect_orb': 15.0,
            'deposit_orb': 50.0,
            'collision_obstacle': -10.0,
            'collision_wall': -5.0,
            'progress_toward_excavation': 1.0,
            'progress_toward_construction': 2.0,
        }
