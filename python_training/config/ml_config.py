"""
ML Training Configuration
Matches TypeScript training system configuration
"""

from typing import Dict, Any


class MLConfig:
    """Central configuration for ML training system"""

    # Environment dimensions (meters)
    WORLD_WIDTH = 9.88
    WORLD_HEIGHT = 5.0

    # Rover properties
    ROVER_LENGTH = 0.6  # meters
    ROVER_WIDTH = 0.4   # meters
    MAX_SPEED = 2.0     # meters/second
    MAX_ANGULAR_VELOCITY = 3.0  # radians/second

    # Simulation
    DT = 1/60.0  # 60 FPS
    MAX_EPISODE_STEPS = 1000

    # Detection/Sensors
    FRUSTUM_DEPTH = 3.0  # meters
    FRUSTUM_FAR_WIDTH = 2.0  # meters
    MAX_DETECTED_OBSTACLES = 5
    MAX_DETECTED_ORBS = 5

    # Objects
    NUM_ORBS = 15
    NUM_ROCKS = 8
    NUM_CRATERS = 8
    ORB_RADIUS = 0.075  # meters (0.15m diameter)
    MAX_ORBS_HELD = 15

    # Observation space dimensions
    OBS_ROVER_STATE = 10  # x, y, heading, speed, is_holding, num_held, in_excavation, in_construction, in_berm, in_obstacle
    OBS_NEAREST_ORB = 3   # distance, angle, in_grab_zone
    OBS_OBSTACLES = 15    # 5 obstacles × (distance, angle, radius)
    OBS_CONSTRUCTION = 2  # distance, angle to construction zone
    OBS_DIM = OBS_ROVER_STATE + OBS_NEAREST_ORB + OBS_OBSTACLES + OBS_CONSTRUCTION  # Total: 33

    # Action space dimensions
    ACTION_DIM = 3  # speed, turn_rate, dig_action

    # Zone boundaries (x_min, x_max, y_min, y_max) in meters
    ZONE_STARTING = (0.0, 2.0, 3.0, 5.0)
    ZONE_EXCAVATION = (0.0, 2.5, 0.0, 3.0)
    ZONE_OBSTACLE = (2.5, 6.88, 0.0, 5.0)
    ZONE_CONSTRUCTION = (6.88, 9.88, 0.0, 1.5)
    ZONE_TARGET_BERM = (6.88, 8.58, 0.35, 1.15)

    # Grab zone
    GRAB_ZONE_DISTANCE = 0.5  # meters from rover center

    @classmethod
    def get_env_config(cls) -> Dict[str, Any]:
        """Get environment configuration dict"""
        return {
            'world_width': cls.WORLD_WIDTH,
            'world_height': cls.WORLD_HEIGHT,
            'rover_length': cls.ROVER_LENGTH,
            'rover_width': cls.ROVER_WIDTH,
            'max_speed': cls.MAX_SPEED,
            'max_angular_velocity': cls.MAX_ANGULAR_VELOCITY,
            'dt': cls.DT,
            'frustum_depth': cls.FRUSTUM_DEPTH,
            'frustum_far_width': cls.FRUSTUM_FAR_WIDTH,
            'num_orbs': cls.NUM_ORBS,
            'num_rocks': cls.NUM_ROCKS,
            'num_craters': cls.NUM_CRATERS,
            'orb_radius': cls.ORB_RADIUS,
            'max_orbs_held': cls.MAX_ORBS_HELD,
            'grab_zone_distance': cls.GRAB_ZONE_DISTANCE,
        }
