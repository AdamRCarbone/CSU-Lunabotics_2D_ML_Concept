"""
Custom Gymnasium environment for Lunabotics rover simulation.
Headless training environment with simplified 2D physics.
Matches TypeScript ML training system with 33-dimensional observation space.
"""

import gymnasium as gym
from gymnasium import spaces
import numpy as np
from typing import Dict, Tuple, Optional, List
import math

from .physics import PhysicsEngine, RigidBody, Circle, Vec2
from config.ml_config import MLConfig
from rewards.reward_calculator import RewardCalculator, Zone


class Orb:
    """Diggable orb that can be picked up"""
    def __init__(self, position: Vec2, radius: float):
        self.position = position
        self.radius = radius
        self.is_picked_up = False
        self.physics_body: Optional[Circle] = None


class LunaboticsEnv(gym.Env):
    """
    Lunabotics rover environment for RL training.
    Matches TypeScript training system.

    Observation Space (33 dimensions):
        [0] rover_x (0-1 normalized)
        [1] rover_y (0-1 normalized)
        [2] rover_heading (0-1 normalized, 0-360° → 0-1)
        [3] rover_speed (-1 to 1)
        [4] is_holding_orbs (0 or 1)
        [5] num_orbs_held (0-1 normalized, 0-15 → 0-1)
        [6] in_excavation_zone (0 or 1)
        [7] in_construction_zone (0 or 1)
        [8] in_berm_zone (0 or 1)
        [9] in_obstacle_zone (0 or 1)
        [10] nearest_orb_distance (0-1 normalized)
        [11] nearest_orb_angle (-1 to 1, relative to heading)
        [12] nearest_orb_in_grab_zone (0 or 1)
        [13-27] obstacles (5 × [distance, angle, radius], 0-1 normalized)
        [28] construction_zone_distance (0-1 normalized)
        [29] construction_zone_angle (-1 to 1, relative to heading)

    Action Space:
        [0] Linear velocity multiplier [-1, 1]
        [1] Angular velocity multiplier [-1, 1]
        [2] Dig action [0, 1]
    """

    metadata = {"render_modes": ["none"], "render_fps": 60}

    def __init__(self, env_config: Optional[Dict] = None, reward_config: Optional[Dict] = None, reward_stage: int = 4):
        super().__init__()

        # Import stage configs
        from env.ml_config import (STAGE_1_DRIVING_CONTROL, STAGE_2_NAVIGATION,
                                     STAGE_3_ORB_COLLECTION, STAGE_4_FULL_TASK)

        # Use ML config
        if env_config is None:
            env_config = MLConfig.get_env_config()

        # Select reward config based on stage
        if reward_config is None:
            stage_configs = {
                1: STAGE_1_DRIVING_CONTROL,
                2: STAGE_2_NAVIGATION,
                3: STAGE_3_ORB_COLLECTION,
                4: STAGE_4_FULL_TASK
            }
            ml_stage_config = stage_configs.get(reward_stage, STAGE_4_FULL_TASK)
            reward_config = RewardCalculator.config_from_mlconfig(ml_stage_config)

        self.env_config = env_config
        self.reward_calculator = RewardCalculator(reward_config)

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
        self.max_detected_obstacles = MLConfig.MAX_DETECTED_OBSTACLES
        self.grab_zone_distance = env_config['grab_zone_distance']

        # Multi-orb support
        self.max_orbs_held = env_config['max_orbs_held']

        # Physics engine
        self.physics = PhysicsEngine(self.world_width, self.world_height)

        # State
        self.rover: Optional[RigidBody] = None
        self.rocks: List[Circle] = []
        self.craters: List[Circle] = []
        self.orbs: List[Orb] = []  # Changed to custom Orb class
        self.orbs_held: List[Orb] = []  # Orbs currently held
        self.current_zone = Zone.STARTING
        self.steps = 0

        # Episode tracking
        self.total_reward = 0.0
        self.orbs_deposited = 0
        self.previous_state: Dict = {}

        # Define observation space (33 dimensions, all normalized to [-1, 1] or [0, 1])
        obs_low = np.array([-1.0] * MLConfig.OBS_DIM, dtype=np.float32)
        obs_high = np.array([1.0] * MLConfig.OBS_DIM, dtype=np.float32)

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
        self.zone_starting = MLConfig.ZONE_STARTING
        self.zone_excavation = MLConfig.ZONE_EXCAVATION
        self.zone_obstacle = MLConfig.ZONE_OBSTACLE
        self.zone_construction = MLConfig.ZONE_CONSTRUCTION
        self.zone_target_berm = MLConfig.ZONE_TARGET_BERM

        # Construction zone center for observations
        self.construction_center = Vec2(
            (self.zone_construction[0] + self.zone_construction[1]) / 2,
            (self.zone_construction[2] + self.zone_construction[3]) / 2
        )

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

        # Spawn orbs with multi-orb support
        self.orbs = []
        for _ in range(self.env_config['num_orbs']):
            pos = self._random_position_in_zone(*self.zone_excavation)
            orb = Orb(position=pos, radius=self.env_config['orb_radius'])
            orb.physics_body = Circle(position=pos, radius=orb.radius, is_static=False)
            self.orbs.append(orb)
            self.physics.add_circle(orb.physics_body)

        # Reset state
        self.orbs_held = []
        self.current_zone = Zone.STARTING
        self.steps = 0
        self.total_reward = 0.0
        self.orbs_deposited = 0
        self.previous_state = self._get_current_state()

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
        force = direction * target_linear_velocity * 10.0
        self.rover.apply_force(force, self.dt)
        self.rover.apply_torque(target_angular_velocity * 5.0, self.dt)

        # Step physics
        self.physics.step(self.dt)

        # Update zone
        self.current_zone = self._get_zone(self.rover.position)

        # Update positions of held orbs
        self._update_held_orbs()

        # Handle dig action
        if dig_action > 0.5:
            # Try to grab or release
            if len(self.orbs_held) == 0:
                # Try to grab nearby orbs
                self._grab_orbs()
            else:
                # Release orbs
                self._release_orbs()

        # Check for orb deposit in target berm
        if len(self.orbs_held) > 0 and self.current_zone == Zone.TARGET_BERM:
            # Deposit all held orbs
            self.orbs_deposited += len(self.orbs_held)
            # Remove deposited orbs from simulation
            for orb in self.orbs_held:
                if orb.physics_body:
                    self.physics.circles.remove(orb.physics_body)
                self.orbs.remove(orb)
            self.orbs_held = []

        # Get current state
        current_state = self._get_current_state()

        # Calculate reward
        reward = self.reward_calculator.calculate_reward(
            current_state,
            self.previous_state,
            {'speed': linear_mult, 'turn': angular_mult, 'dig': dig_action}
        )
        self.total_reward += reward

        # Update previous state
        self.previous_state = current_state

        # Check termination
        self.steps += 1
        terminated = self.orbs_deposited >= self.env_config['num_orbs']  # Mission complete
        truncated = self.steps >= MLConfig.MAX_EPISODE_STEPS  # Max steps

        # Observation
        obs = self._get_observation()

        # Info
        info = {
            'steps': self.steps,
            'total_reward': self.total_reward,
            'orbs_held': len(self.orbs_held),
            'orbs_deposited': self.orbs_deposited,
            'current_zone': self.current_zone.name,
        }

        return obs, reward, terminated, truncated, info

    def _grab_orbs(self):
        """Grab all orbs within grab zone"""
        if len(self.orbs_held) >= self.max_orbs_held:
            return

        for orb in self.orbs:
            if orb.is_picked_up:
                continue

            # Check if orb is in grab zone
            dist = (self.rover.position - orb.position).magnitude()
            if dist < self.grab_zone_distance:
                # Calculate relative angle to check if orb is in front
                relative_pos = orb.position - self.rover.position
                angle_to_orb = math.atan2(relative_pos.y, relative_pos.x)
                relative_angle = angle_to_orb - self.rover.angle

                # Normalize angle to [-pi, pi]
                relative_angle = math.atan2(math.sin(relative_angle), math.cos(relative_angle))

                # Only grab if orb is in front (within 90 degrees)
                if abs(relative_angle) < math.pi / 2:
                    orb.is_picked_up = True
                    self.orbs_held.append(orb)

                    if len(self.orbs_held) >= self.max_orbs_held:
                        break

    def _release_orbs(self):
        """Release all held orbs"""
        for orb in self.orbs_held:
            orb.is_picked_up = False
        self.orbs_held = []

    def _update_held_orbs(self):
        """Update positions of held orbs to follow rover"""
        for orb in self.orbs_held:
            # Keep orbs at rover position (Vec2 doesn't have copy, create new Vec2)
            orb.position = Vec2(self.rover.position.x, self.rover.position.y)
            if orb.physics_body:
                orb.physics_body.position = Vec2(self.rover.position.x, self.rover.position.y)

    def _get_current_state(self) -> Dict:
        """Get current state for reward calculation"""
        # Check collisions
        collisions = self.physics.get_circle_collisions(self.rover)
        collided_with_obstacle = any(obj in self.rocks or obj in self.craters for obj in collisions)
        collided_with_wall = (
            self.rover.position.x < 0 or self.rover.position.x > self.world_width or
            self.rover.position.y < 0 or self.rover.position.y > self.world_height
        )

        return {
            'rover_x': self.rover.position.x,
            'rover_y': self.rover.position.y,
            'current_zone': self.current_zone,
            'num_orbs_held': len(self.orbs_held),
            'orbs_deposited': self.orbs_deposited,
            'collided_with_obstacle': collided_with_obstacle,
            'collided_with_wall': collided_with_wall,
        }

    def _get_observation(self) -> np.ndarray:
        """
        Get current observation (33 dimensions).
        All values normalized to appropriate ranges.
        """
        obs = []

        # [0] Rover X position (0-1 normalized)
        obs.append(self.rover.position.x / self.world_width)

        # [1] Rover Y position (0-1 normalized)
        obs.append(self.rover.position.y / self.world_height)

        # [2] Rover heading (0-1 normalized, 0-360° → 0-1)
        heading_deg = math.degrees(self.rover.angle) % 360
        obs.append(heading_deg / 360.0)

        # [3] Rover speed (-1 to 1)
        speed = self.rover.velocity.magnitude()
        normalized_speed = np.clip(speed / self.max_speed, -1.0, 1.0)
        obs.append(normalized_speed)

        # [4] Is holding orbs (0 or 1)
        obs.append(1.0 if len(self.orbs_held) > 0 else 0.0)

        # [5] Number of orbs held (0-1 normalized)
        obs.append(len(self.orbs_held) / self.max_orbs_held)

        # [6-9] Zone flags
        obs.append(1.0 if self.current_zone == Zone.EXCAVATION else 0.0)
        obs.append(1.0 if self.current_zone == Zone.CONSTRUCTION else 0.0)
        obs.append(1.0 if self.current_zone == Zone.TARGET_BERM else 0.0)
        obs.append(1.0 if self.current_zone == Zone.OBSTACLE else 0.0)

        # [10-12] Nearest orb info
        nearest_orb_dist, nearest_orb_angle, nearest_orb_in_grab = self._get_nearest_orb_info()
        obs.append(nearest_orb_dist)
        obs.append(nearest_orb_angle)
        obs.append(nearest_orb_in_grab)

        # [13-27] Obstacles (5 × [distance, angle, radius])
        obstacle_info = self._get_obstacle_info()
        obs.extend(obstacle_info)

        # [28-29] Construction zone direction
        construction_dist, construction_angle = self._get_construction_zone_info()
        obs.append(construction_dist)
        obs.append(construction_angle)

        return np.array(obs, dtype=np.float32)

    def _get_nearest_orb_info(self) -> Tuple[float, float, float]:
        """
        Get info about nearest orb.
        Returns: (distance 0-1, angle -1 to 1, in_grab_zone 0 or 1)
        """
        available_orbs = [orb for orb in self.orbs if not orb.is_picked_up]

        if not available_orbs:
            return 0.0, 0.0, 0.0

        # Find nearest orb
        nearest_orb = None
        min_dist = float('inf')

        for orb in available_orbs:
            dist = (self.rover.position - orb.position).magnitude()
            if dist < min_dist:
                min_dist = dist
                nearest_orb = orb

        if nearest_orb is None:
            return 0.0, 0.0, 0.0

        # Calculate relative angle
        relative_pos = nearest_orb.position - self.rover.position
        angle_to_orb = math.atan2(relative_pos.y, relative_pos.x)
        relative_angle = angle_to_orb - self.rover.angle

        # Normalize angle to [-pi, pi]
        relative_angle = math.atan2(math.sin(relative_angle), math.cos(relative_angle))

        # Normalize distance (0-1, with max distance = diagonal of world)
        max_dist = math.sqrt(self.world_width ** 2 + self.world_height ** 2)
        normalized_dist = min(min_dist / max_dist, 1.0)

        # Normalize angle to [-1, 1]
        normalized_angle = relative_angle / math.pi

        # Check if in grab zone
        in_grab_zone = 1.0 if (min_dist < self.grab_zone_distance and abs(relative_angle) < math.pi / 2) else 0.0

        return normalized_dist, normalized_angle, in_grab_zone

    def _get_obstacle_info(self) -> List[float]:
        """
        Get info about nearest obstacles.
        Returns 15 values: 5 obstacles × (distance, angle, radius)
        All normalized to 0-1 or -1 to 1
        """
        obstacles = self.rocks + self.craters
        obstacle_data = []

        # Calculate distance and angle for each obstacle
        for obstacle in obstacles:
            dist = (self.rover.position - obstacle.position).magnitude()
            relative_pos = obstacle.position - self.rover.position
            angle_to_obstacle = math.atan2(relative_pos.y, relative_pos.x)
            relative_angle = angle_to_obstacle - self.rover.angle
            relative_angle = math.atan2(math.sin(relative_angle), math.cos(relative_angle))

            obstacle_data.append({
                'distance': dist,
                'angle': relative_angle,
                'radius': obstacle.radius
            })

        # Sort by distance
        obstacle_data.sort(key=lambda x: x['distance'])

        # Take nearest 5
        result = []
        max_dist = math.sqrt(self.world_width ** 2 + self.world_height ** 2)
        max_radius = 0.5  # Reasonable max radius for normalization

        for i in range(self.max_detected_obstacles):
            if i < len(obstacle_data):
                obs_data = obstacle_data[i]
                # Normalize distance (0-1)
                normalized_dist = min(obs_data['distance'] / max_dist, 1.0)
                # Normalize angle (-1 to 1)
                normalized_angle = obs_data['angle'] / math.pi
                # Normalize radius (0-1)
                normalized_radius = min(obs_data['radius'] / max_radius, 1.0)
                result.extend([normalized_dist, normalized_angle, normalized_radius])
            else:
                result.extend([0.0, 0.0, 0.0])

        return result

    def _get_construction_zone_info(self) -> Tuple[float, float]:
        """
        Get direction to construction zone.
        Returns: (distance 0-1, angle -1 to 1)
        """
        # Calculate distance to construction center
        dist = (self.rover.position - self.construction_center).magnitude()

        # Calculate relative angle
        relative_pos = self.construction_center - self.rover.position
        angle_to_construction = math.atan2(relative_pos.y, relative_pos.x)
        relative_angle = angle_to_construction - self.rover.angle

        # Normalize angle to [-pi, pi]
        relative_angle = math.atan2(math.sin(relative_angle), math.cos(relative_angle))

        # Normalize distance (0-1)
        max_dist = math.sqrt(self.world_width ** 2 + self.world_height ** 2)
        normalized_dist = min(dist / max_dist, 1.0)

        # Normalize angle (-1 to 1)
        normalized_angle = relative_angle / math.pi

        return normalized_dist, normalized_angle

    def render(self):
        """Render (not implemented for headless training)"""
        pass

    def close(self):
        """Cleanup"""
        pass
