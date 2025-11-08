"""
Custom Gymnasium environment for Lunabotics rover simulation.
Headless training environment with simplified 2D physics.
"""

import gymnasium as gym
from gymnasium import spaces
import numpy as np
from typing import Dict, Tuple, Optional, List
from enum import Enum

from .physics import PhysicsEngine, RigidBody, Circle, Vec2


class Zone(Enum):
    """Environment zones"""
    STARTING = 0
    EXCAVATION = 1
    OBSTACLE = 2
    CONSTRUCTION = 3
    TARGET_BERM = 4
    NONE = 5


class LunaboticsEnv(gym.Env):
    """
    Lunabotics rover environment for RL training.

    Observation Space:
        - Rover position (x, y)
        - Rover velocity (vx, vy)
        - Rover angle (radians)
        - Rover angular velocity
        - Current zone
        - Holding orb (0 or 1)
        - Detected obstacles (up to 5 closest, distance + angle)
        - Detected orbs (up to 5 closest, distance + angle)

    Action Space:
        - Linear velocity multiplier [-1, 1]
        - Angular velocity multiplier [-1, 1]
        - Dig action (0 or 1)

    Rewards:
        - Configured via reward_config dict
        - Progress toward goals
        - Successful orb collection and deposit
        - Penalties for collisions
    """

    metadata = {"render_modes": ["none"], "render_fps": 60}

    def __init__(self, env_config: Dict, reward_config: Dict):
        super().__init__()

        # Configuration
        self.env_config = env_config
        self.reward_config = reward_config

        # World dimensions
        self.world_width = env_config['world_width']
        self.world_height = env_config['world_height']

        # Rover properties
        self.rover_length = env_config['rover_length']
        self.rover_width = env_config['rover_width']
        self.max_speed = env_config['max_speed']
        self.max_angular_velocity = env_config['max_angular_velocity']
        self.dt = env_config['dt']

        # Detection
        self.frustum_depth = env_config['frustum_depth']
        self.frustum_far_width = env_config['frustum_far_width']
        self.max_detected_obstacles = 5
        self.max_detected_orbs = 5

        # Physics engine
        self.physics = PhysicsEngine(self.world_width, self.world_height)

        # State
        self.rover: Optional[RigidBody] = None
        self.rocks: List[Circle] = []
        self.craters: List[Circle] = []
        self.orbs: List[Circle] = []
        self.holding_orb = False
        self.current_zone = Zone.STARTING
        self.steps = 0

        # Episode tracking
        self.total_reward = 0.0
        self.orbs_collected = 0
        self.orbs_deposited = 0

        # Define observation space
        # [rover_x, rover_y, rover_vx, rover_vy, rover_angle, rover_angular_vel,
        #  zone, holding_orb,
        #  obstacle_1_dist, obstacle_1_angle, ..., obstacle_5_dist, obstacle_5_angle,
        #  orb_1_dist, orb_1_angle, ..., orb_5_dist, orb_5_angle]
        obs_dim = 8 + (self.max_detected_obstacles * 2) + (self.max_detected_orbs * 2)

        # Define reasonable bounds for TF-Agents compatibility
        obs_low = np.array([
            0.0,  # rover_x (min)
            0.0,  # rover_y (min)
            -10.0,  # rover_vx (min velocity)
            -10.0,  # rover_vy (min velocity)
            -np.pi,  # rover_angle (min)
            -10.0,  # rover_angular_vel (min)
            0.0,  # zone (min)
            0.0,  # holding_orb (min)
        ] + [0.0, -np.pi] * (self.max_detected_obstacles + self.max_detected_orbs),  # distances and angles
        dtype=np.float32)

        obs_high = np.array([
            self.world_width,  # rover_x (max)
            self.world_height,  # rover_y (max)
            10.0,  # rover_vx (max velocity)
            10.0,  # rover_vy (max velocity)
            np.pi,  # rover_angle (max)
            10.0,  # rover_angular_vel (max)
            6.0,  # zone (max - 6 zones)
            1.0,  # holding_orb (max)
        ] + [10.0, np.pi] * (self.max_detected_obstacles + self.max_detected_orbs),  # distances and angles
        dtype=np.float32)

        self.observation_space = spaces.Box(
            low=obs_low,
            high=obs_high,
            dtype=np.float32
        )

        # Define action space
        # [linear_velocity_multiplier, angular_velocity_multiplier, dig_action]
        self.action_space = spaces.Box(
            low=np.array([-1.0, -1.0, 0.0]),
            high=np.array([1.0, 1.0, 1.0]),
            dtype=np.float32
        )

        # Zone boundaries (x_start, x_end, y_start, y_end)
        self._define_zones()

    def _define_zones(self):
        """Define zone boundaries based on Lunabotics competition layout"""
        # Starting zone: bottom-left, 2m x 2m
        self.zone_starting = (0, 2.0, 3.0, 5.0)

        # Excavation zone: 2.5m wide
        self.zone_excavation = (0, 2.5, 0, 3.0)

        # Obstacle zone: 4.38m wide
        self.zone_obstacle = (2.5, 6.88, 0, 5.0)

        # Construction zone: 3m x 1.5m
        self.zone_construction = (6.88, 9.88, 0, 1.5)

        # Target berm: 1.7m x 0.8m (within construction zone)
        self.zone_target_berm = (6.88, 8.58, 0.35, 1.15)

    def _get_zone(self, position: Vec2) -> Zone:
        """Determine which zone a position is in"""
        x, y = position.x, position.y

        # Check zones in priority order
        if self._point_in_bounds(x, y, *self.zone_target_berm):
            return Zone.TARGET_BERM
        elif self._point_in_bounds(x, y, *self.zone_construction):
            return Zone.CONSTRUCTION
        elif self._point_in_bounds(x, y, *self.zone_starting):
            return Zone.STARTING
        elif self._point_in_bounds(x, y, *self.zone_excavation):
            return Zone.EXCAVATION
        elif self._point_in_bounds(x, y, *self.zone_obstacle):
            return Zone.OBSTACLE
        else:
            return Zone.NONE

    def _point_in_bounds(self, x: float, y: float, x_min: float, x_max: float, y_min: float, y_max: float) -> bool:
        """Check if point is within bounds"""
        return x_min <= x <= x_max and y_min <= y <= y_max

    def reset(self, seed: Optional[int] = None, options: Optional[Dict] = None) -> Tuple[np.ndarray, Dict]:
        """Reset the environment to initial state"""
        super().reset(seed=seed)

        # Reset physics
        self.physics = PhysicsEngine(self.world_width, self.world_height)

        # Create rover at starting position (center of starting zone)
        start_x = 1.0
        start_y = 4.0
        self.rover = RigidBody(
            position=Vec2(start_x, start_y),
            velocity=Vec2(0, 0),
            angle=0.0,
            angular_velocity=0.0,
            width=self.rover_width,
            height=self.rover_length,
            friction=0.3
        )
        self.physics.add_body(self.rover)

        # Spawn obstacles
        self.rocks = []
        self.craters = []
        for _ in range(self.env_config['num_rocks']):
            pos = self._random_position_in_zone(*self.zone_obstacle)
            rock = Circle(position=pos, radius=np.random.uniform(0.15, 0.2), is_static=True)
            self.rocks.append(rock)
            self.physics.add_circle(rock)

        for _ in range(self.env_config['num_craters']):
            pos = self._random_position_in_zone(*self.zone_obstacle)
            crater = Circle(position=pos, radius=np.random.uniform(0.15, 0.25), is_static=True)
            self.craters.append(crater)
            self.physics.add_circle(crater)

        # Spawn orbs
        self.orbs = []
        for _ in range(self.env_config['num_orbs']):
            pos = self._random_position_in_zone(*self.zone_excavation)
            orb = Circle(position=pos, radius=0.075, is_static=False)
            self.orbs.append(orb)
            self.physics.add_circle(orb)

        # Reset state
        self.holding_orb = False
        self.current_zone = Zone.STARTING
        self.steps = 0
        self.total_reward = 0.0
        self.orbs_collected = 0
        self.orbs_deposited = 0

        return self._get_observation(), {}

    def _random_position_in_zone(self, x_min: float, x_max: float, y_min: float, y_max: float) -> Vec2:
        """Generate random position within zone bounds"""
        x = np.random.uniform(x_min, x_max)
        y = np.random.uniform(y_min, y_max)
        return Vec2(x, y)

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        """Execute one time step"""
        linear_mult, angular_mult, dig_action = action

        # Apply rover controls
        target_linear_velocity = linear_mult * self.max_speed
        target_angular_velocity = angular_mult * self.max_angular_velocity

        # Convert to force (simplified)
        direction = Vec2(np.cos(self.rover.angle), np.sin(self.rover.angle))
        force = direction * target_linear_velocity * 10.0  # force magnitude
        self.rover.apply_force(force, self.dt)
        self.rover.apply_torque(target_angular_velocity * 5.0, self.dt)

        # Step physics
        self.physics.step(self.dt)

        # Update zone
        prev_zone = self.current_zone
        self.current_zone = self._get_zone(self.rover.position)

        # Handle dig action
        if dig_action > 0.5 and not self.holding_orb:
            # Try to grab nearby orb
            for orb in self.orbs:
                dist = (self.rover.position - orb.position).magnitude()
                if dist < 0.5:  # grab range
                    self.holding_orb = True
                    self.orbs.remove(orb)
                    self.physics.circles.remove(orb)
                    self.orbs_collected += 1
                    break

        # Check for orb deposit
        if self.holding_orb and self.current_zone == Zone.TARGET_BERM:
            self.holding_orb = False
            self.orbs_deposited += 1

        # Calculate reward
        reward = self._calculate_reward(action, prev_zone)
        self.total_reward += reward

        # Check termination
        self.steps += 1
        terminated = self.orbs_deposited >= self.env_config['num_orbs']  # Mission complete
        truncated = self.steps >= 1000  # Max steps

        # Observation
        obs = self._get_observation()

        # Info
        info = {
            'steps': self.steps,
            'total_reward': self.total_reward,
            'orbs_collected': self.orbs_collected,
            'orbs_deposited': self.orbs_deposited,
            'current_zone': self.current_zone.name,
        }

        return obs, reward, terminated, truncated, info

    def _calculate_reward(self, action: np.ndarray, prev_zone: Zone) -> float:
        """Calculate reward for current step"""
        reward = 0.0
        cfg = self.reward_config

        # Time penalty
        reward += cfg['time_step']

        # Zone progression rewards
        if self.current_zone == Zone.EXCAVATION and prev_zone == Zone.STARTING:
            reward += cfg['reach_excavation_zone']

        if self.current_zone == Zone.CONSTRUCTION and self.holding_orb:
            reward += cfg['reach_construction_zone_with_orb']

        # Orb collection
        if self.holding_orb and not hasattr(self, '_was_holding_orb'):
            reward += cfg['collect_orb']
        self._was_holding_orb = self.holding_orb

        # Orb deposit (checked in step())
        if hasattr(self, '_prev_deposited'):
            if self.orbs_deposited > self._prev_deposited:
                reward += cfg['deposit_orb']
        self._prev_deposited = self.orbs_deposited

        # Collision penalties
        collisions = self.physics.get_circle_collisions(self.rover)
        if collisions:
            for obj in collisions:
                if obj in self.rocks or obj in self.craters:
                    reward += cfg['collision_obstacle']

        # Wall collision check (simple bounds check)
        if (self.rover.position.x < 0 or self.rover.position.x > self.world_width or
            self.rover.position.y < 0 or self.rover.position.y > self.world_height):
            reward += cfg['collision_wall']

        # Shaping reward: progress toward excavation zone (when not holding orb)
        if not self.holding_orb and self.current_zone != Zone.EXCAVATION:
            # Distance to excavation zone center
            excavation_center = Vec2(1.25, 1.5)
            dist_to_excavation = (self.rover.position - excavation_center).magnitude()
            # Small reward for getting closer
            if hasattr(self, '_prev_dist_to_excavation'):
                delta_dist = self._prev_dist_to_excavation - dist_to_excavation
                reward += delta_dist * cfg['progress_toward_excavation']
            self._prev_dist_to_excavation = dist_to_excavation

        # Shaping reward: progress toward construction zone (when holding orb)
        if self.holding_orb:
            construction_center = Vec2(8.38, 0.75)
            dist_to_construction = (self.rover.position - construction_center).magnitude()
            if hasattr(self, '_prev_dist_to_construction'):
                delta_dist = self._prev_dist_to_construction - dist_to_construction
                reward += delta_dist * cfg['progress_toward_construction']
            self._prev_dist_to_construction = dist_to_construction

        return reward

    def _get_observation(self) -> np.ndarray:
        """Get current observation"""
        obs = []

        # Rover state
        obs.extend([
            self.rover.position.x,
            self.rover.position.y,
            self.rover.velocity.x,
            self.rover.velocity.y,
            self.rover.angle,
            self.rover.angular_velocity,
            float(self.current_zone.value),
            float(self.holding_orb),
        ])

        # Detected obstacles (closest 5 in frustum)
        detected_obstacles = self._detect_objects_in_frustum(self.rocks + self.craters)
        for i in range(self.max_detected_obstacles):
            if i < len(detected_obstacles):
                dist, angle = detected_obstacles[i]
                obs.extend([dist, angle])
            else:
                obs.extend([0.0, 0.0])  # No detection

        # Detected orbs (closest 5 in frustum)
        detected_orbs = self._detect_objects_in_frustum(self.orbs)
        for i in range(self.max_detected_orbs):
            if i < len(detected_orbs):
                dist, angle = detected_orbs[i]
                obs.extend([dist, angle])
            else:
                obs.extend([0.0, 0.0])  # No detection

        return np.array(obs, dtype=np.float32)

    def _detect_objects_in_frustum(self, objects: List[Circle]) -> List[Tuple[float, float]]:
        """Detect objects within frustum and return (distance, relative_angle) pairs"""
        detections = []

        for obj in objects:
            # Calculate relative position
            relative_pos = obj.position - self.rover.position
            distance = relative_pos.magnitude()

            # Check if within frustum depth
            if distance > self.frustum_depth:
                continue

            # Calculate relative angle
            angle_to_obj = np.arctan2(relative_pos.y, relative_pos.x)
            relative_angle = angle_to_obj - self.rover.angle

            # Normalize angle to [-pi, pi]
            relative_angle = np.arctan2(np.sin(relative_angle), np.cos(relative_angle))

            # Calculate frustum width at this distance
            frustum_width_at_dist = (distance / self.frustum_depth) * self.frustum_far_width

            # Check if within frustum cone (simplified)
            lateral_offset = distance * np.tan(relative_angle)
            if abs(lateral_offset) <= frustum_width_at_dist / 2:
                detections.append((distance, relative_angle))

        # Sort by distance and return closest ones
        detections.sort(key=lambda x: x[0])
        return detections

    def render(self):
        """Render (not implemented for headless training)"""
        pass

    def close(self):
        """Cleanup"""
        pass
