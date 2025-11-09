"""
ML Configuration - Port of TypeScript ml-types.ts
Training configurations matching the TypeScript browser-based training system.
"""

from dataclasses import dataclass
from typing import Dict


@dataclass
class MLConfig:
    """
    ML Training Configuration
    Matches MLConfig interface from TypeScript
    """
    # Episode settings
    max_episode_steps: int
    step_penalty: float
    collision_penalty: float

    # ============ PROGRESSION REWARDS (encourage full cycle) ============

    # Step 1: Grab orbs
    grab_orb_reward: float

    # Step 2: Leave excavation zone with orbs
    leave_excavation_with_orbs_reward: float

    # Step 3: Enter obstacle zone with orbs
    enter_obstacle_with_orbs_reward: float

    # Step 4: Enter construction zone with orbs
    enter_construction_with_orbs_reward: float

    # Step 5: Deposit rewards (MAIN TASK)
    deposit_berm_reward: float
    deposit_construction_reward: float

    # Step 6: Return to excavation
    return_to_excavation_reward: float

    # ============ PER-STEP REWARDS (continuous encouragement) ============

    # Holding orbs (per step)
    holding_orbs_in_excavation_reward: float
    holding_orbs_in_obstacle_reward: float
    holding_orbs_in_construction_reward: float

    # Exploration/navigation
    distance_traveled_reward: float
    leaving_starting_zone_bonus: float

    # ============ PENALTIES ============

    # Drop penalties
    drop_excavation_penalty: float
    drop_obstacle_penalty: float
    drop_starting_penalty: float
    drop_none_penalty: float

    # Idle/inefficiency penalties
    idle_penalty: float
    idle_speed_threshold: float
    stuck_in_starting_zone_penalty: float

    # Movement direction penalties/rewards
    backward_movement_penalty: float
    forward_movement_reward: float

    # Orb management rewards/penalties
    wasteful_drop_penalty: float
    wasteful_drop_threshold: int
    orb_swap_reward: float
    holding_orbs_outside_construction_penalty: float
    disable_holding_penalty: bool

    # ============ SMOOTH CONTROL ============
    smooth_acceleration_reward: float
    smooth_turning_reward: float
    smooth_threshold: float

    # Speed consistency rewards
    maintaining_speed_reward: float
    maintaining_speed_threshold: float
    high_speed_reward: float
    high_speed_threshold: float

    # Heading consistency rewards
    maintaining_heading_reward: float
    maintaining_heading_threshold: float  # degrees

    # Action oscillation penalties
    speed_oscillation_penalty: float
    oscillation_window: int

    # ============ SHAPING REWARDS ============
    use_shaping_rewards: bool
    shaping_reward_scale: float


# STAGE 1: Foundation - Smooth Driving & Collision Avoidance
STAGE_1_DRIVING_CONTROL = MLConfig(
    max_episode_steps=10000,
    step_penalty=-0.01,
    collision_penalty=-200,

    # Progression rewards - ALL DISABLED
    grab_orb_reward=0.0,
    leave_excavation_with_orbs_reward=0.0,
    enter_obstacle_with_orbs_reward=0.0,
    enter_construction_with_orbs_reward=0.0,
    deposit_berm_reward=0.0,
    deposit_construction_reward=0.0,
    return_to_excavation_reward=0.0,

    # Holding rewards - DISABLED
    holding_orbs_in_excavation_reward=0.0,
    holding_orbs_in_obstacle_reward=0.0,
    holding_orbs_in_construction_reward=0.0,

    # Exploration
    distance_traveled_reward=0.001,
    leaving_starting_zone_bonus=20.0,

    # Drop penalties - DISABLED
    drop_excavation_penalty=0.0,
    drop_obstacle_penalty=0.0,
    drop_starting_penalty=0.0,
    drop_none_penalty=0.0,

    # Efficiency
    idle_penalty=-1.0,
    idle_speed_threshold=0.05,
    stuck_in_starting_zone_penalty=-0.5,

    # Movement habits
    backward_movement_penalty=-3.0,
    forward_movement_reward=0.1,

    # Orb management - DISABLED
    wasteful_drop_penalty=0.0,
    wasteful_drop_threshold=2,
    orb_swap_reward=0.0,
    holding_orbs_outside_construction_penalty=0.0,
    disable_holding_penalty=True,

    # Smooth control - EMPHASIZED
    smooth_acceleration_reward=0.5,
    smooth_turning_reward=0.5,
    smooth_threshold=0.15,

    maintaining_speed_reward=0.3,
    maintaining_speed_threshold=0.05,
    high_speed_reward=0.2,
    high_speed_threshold=0.6,

    maintaining_heading_reward=0.3,
    maintaining_heading_threshold=3.0,

    speed_oscillation_penalty=-2.0,
    oscillation_window=3,

    # Shaping - DISABLED
    use_shaping_rewards=False,
    shaping_reward_scale=0.0
)


# STAGE 2: Obstacle Avoidance & Navigation
STAGE_2_NAVIGATION = MLConfig(
    max_episode_steps=10000,
    step_penalty=-0.05,
    collision_penalty=-200,

    # Progression rewards - navigation only, NO orbs
    grab_orb_reward=0.0,
    leave_excavation_with_orbs_reward=0.0,
    enter_obstacle_with_orbs_reward=0.0,
    enter_construction_with_orbs_reward=0.0,
    deposit_berm_reward=0.0,
    deposit_construction_reward=0.0,
    return_to_excavation_reward=0.0,

    # Holding rewards - DISABLED
    holding_orbs_in_excavation_reward=0.0,
    holding_orbs_in_obstacle_reward=0.0,
    holding_orbs_in_construction_reward=0.0,

    # Exploration
    distance_traveled_reward=0.0,
    leaving_starting_zone_bonus=50.0,

    # Drop penalties - DISABLED
    drop_excavation_penalty=0.0,
    drop_obstacle_penalty=0.0,
    drop_starting_penalty=0.0,
    drop_none_penalty=0.0,

    # Idle penalties
    idle_penalty=-1.0,
    idle_speed_threshold=0.05,
    stuck_in_starting_zone_penalty=-0.5,

    # Movement direction
    backward_movement_penalty=-3.0,
    forward_movement_reward=0.5,

    # Orb management - DISABLED
    wasteful_drop_penalty=0.0,
    wasteful_drop_threshold=2,
    orb_swap_reward=0.0,
    holding_orbs_outside_construction_penalty=0.0,
    disable_holding_penalty=True,

    # Smooth control
    smooth_acceleration_reward=0.5,
    smooth_turning_reward=0.5,
    smooth_threshold=0.15,

    maintaining_speed_reward=0.3,
    maintaining_speed_threshold=0.05,
    high_speed_reward=0.5,
    high_speed_threshold=0.6,

    maintaining_heading_reward=0.3,
    maintaining_heading_threshold=3.0,

    speed_oscillation_penalty=-2.0,
    oscillation_window=3,

    # Shaping - PRIMARY GOAL
    use_shaping_rewards=True,
    shaping_reward_scale=10.0
)


# STAGE 3: Orb Collection & Transport
STAGE_3_ORB_COLLECTION = MLConfig(
    max_episode_steps=10000,
    step_penalty=-0.05,
    collision_penalty=-300,

    # Progression rewards - MAIN TASK
    grab_orb_reward=20.0,
    leave_excavation_with_orbs_reward=50.0,
    enter_obstacle_with_orbs_reward=75.0,
    enter_construction_with_orbs_reward=150.0,
    deposit_berm_reward=500,
    deposit_construction_reward=400,
    return_to_excavation_reward=50.0,

    # Holding rewards
    holding_orbs_in_excavation_reward=-0.5,
    holding_orbs_in_obstacle_reward=0.3,
    holding_orbs_in_construction_reward=1.5,

    # Exploration
    distance_traveled_reward=0.0,
    leaving_starting_zone_bonus=30.0,

    # Drop penalties
    drop_excavation_penalty=-50,
    drop_obstacle_penalty=-150,
    drop_starting_penalty=-75,
    drop_none_penalty=-75,

    # Idle penalties
    idle_penalty=-1.0,
    idle_speed_threshold=0.05,
    stuck_in_starting_zone_penalty=-0.5,

    # Movement direction
    backward_movement_penalty=-3.0,
    forward_movement_reward=0.3,

    # Orb management
    wasteful_drop_penalty=-100,
    wasteful_drop_threshold=2,
    orb_swap_reward=5.0,
    holding_orbs_outside_construction_penalty=-0.75,
    disable_holding_penalty=False,

    # Smooth control
    smooth_acceleration_reward=0.4,
    smooth_turning_reward=0.4,
    smooth_threshold=0.15,

    maintaining_speed_reward=0.2,
    maintaining_speed_threshold=0.05,
    high_speed_reward=0.4,
    high_speed_threshold=0.6,

    maintaining_heading_reward=0.2,
    maintaining_heading_threshold=3.0,

    speed_oscillation_penalty=-1.5,
    oscillation_window=3,

    # Shaping
    use_shaping_rewards=True,
    shaping_reward_scale=3.0
)


# STAGE 4: Full NASA Lunabotics Task - COMPETITION-OPTIMIZED
STAGE_4_FULL_TASK = MLConfig(
    max_episode_steps=10000,
    step_penalty=-0.2,
    collision_penalty=-1000,

    # Progression rewards (exponential)
    grab_orb_reward=15.0,
    leave_excavation_with_orbs_reward=40.0,
    enter_obstacle_with_orbs_reward=0.0,  # REMOVED
    enter_construction_with_orbs_reward=100.0,
    deposit_berm_reward=2000,
    deposit_construction_reward=1000,
    return_to_excavation_reward=150.0,

    # Per-step guidance
    holding_orbs_in_excavation_reward=-2.0,
    holding_orbs_in_obstacle_reward=-0.5,
    holding_orbs_in_construction_reward=5.0,

    # Exploration (minimal)
    distance_traveled_reward=0.0,
    leaving_starting_zone_bonus=0.0,

    # Drop penalties (disaster)
    drop_excavation_penalty=-150,
    drop_obstacle_penalty=-500,
    drop_starting_penalty=-200,
    drop_none_penalty=-200,

    # Efficiency penalties
    idle_penalty=-3.0,
    idle_speed_threshold=0.05,
    stuck_in_starting_zone_penalty=-8.0,

    # Movement optimization
    backward_movement_penalty=-8.0,
    forward_movement_reward=0.0,

    # Orb management
    wasteful_drop_penalty=-300,
    wasteful_drop_threshold=2,
    orb_swap_reward=8.0,
    holding_orbs_outside_construction_penalty=-2.0,
    disable_holding_penalty=False,

    # Control quality (only penalties)
    smooth_acceleration_reward=0.0,
    smooth_turning_reward=0.0,
    smooth_threshold=0.12,

    maintaining_speed_reward=0.0,
    maintaining_speed_threshold=0.04,
    high_speed_reward=0.0,
    high_speed_threshold=0.65,

    maintaining_heading_reward=0.0,
    maintaining_heading_threshold=2.5,

    speed_oscillation_penalty=-5.0,
    oscillation_window=3,

    # NO shaping rewards
    use_shaping_rewards=False,
    shaping_reward_scale=0.0
)


# Default configuration
DEFAULT_ML_CONFIG = STAGE_4_FULL_TASK
