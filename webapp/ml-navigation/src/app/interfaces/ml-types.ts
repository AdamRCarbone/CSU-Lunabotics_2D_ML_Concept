// ML Types and Interfaces for Reinforcement Learning

/**
 * Observation vector sent to the ML agent
 * Fixed-size array of normalized values
 */
export interface MLObservation {
  // Rover state (4 values)
  rover_x: number;              // 0-1 normalized
  rover_y: number;              // 0-1 normalized
  rover_heading: number;        // 0-1 normalized (0-360° → 0-1)
  rover_speed: number;          // -1 to 1

  // Digging state (2 values)
  is_holding_orbs: number;      // 0 or 1
  num_orbs_held: number;        // 0-1 normalized (0-15 → 0-1)

  // Zone info (4 values)
  in_excavation_zone: number;   // 0 or 1
  in_construction_zone: number; // 0 or 1
  in_berm_zone: number;         // 0 or 1
  in_obstacle_zone: number;     // 0 or 1

  // Nearest orb (3 values, zeros if none)
  nearest_orb_distance: number;     // 0-1 normalized
  nearest_orb_angle: number;        // -1 to 1 (relative to heading)
  nearest_orb_in_grab_zone: number; // 0 or 1

  // Obstacles in frustum (15 values - up to 5 closest)
  obstacles: number[];          // [dist1, angle1, radius1, dist2, angle2, radius2, ...] padded to 15

  // Target zone direction (2 values)
  construction_zone_distance: number; // 0-1 normalized
  construction_zone_angle: number;    // -1 to 1 (relative to heading)
}

/**
 * Action vector from the ML agent
 * Continuous values that control the rover
 */
export interface MLAction {
  speed: number;       // -1 to 1 (forward/backward)
  turn_rate: number;   // -1 to 1 (turn left/turn right, counterclockwise/clockwise)
  dig_action: number;  // 0 to 1 (threshold at 0.5 to trigger dig toggle)
}

/**
 * Result of taking a step in the environment
 */
export interface MLStepResult {
  observation: number[];  // Flat array from MLObservation
  reward: number;         // Reward for this step
  done: boolean;          // Episode terminated?
  info: MLStepInfo;       // Additional information
}

/**
 * Additional information about the episode state
 */
export interface MLStepInfo {
  episode_length: number;
  orbs_collected: number;
  orbs_deposited_construction: number;
  orbs_deposited_berm: number;
  collision_occurred: boolean;
  zone: string;
  total_reward: number;
}

/**
 * Message sent from browser to Python
 */
export interface BrowserMessage {
  type: 'state' | 'reset_complete';
  observation?: number[];
  reward?: number;
  done?: boolean;
  info?: MLStepInfo;
}

/**
 * Message received from Python
 */
export interface PythonMessage {
  type: 'action' | 'reset_request' | 'set_timescale' | 'set_config' | 'checkpoint_info' | 'parallel_training_info' | 'ready_to_resume';
  action?: number[];  // [speed, heading, dig_action]
  timescale?: number; // Simulation speed multiplier (1.0 = normal, 2.0 = 2x speed, etc.)
  max_episode_steps?: number; // Maximum steps per episode
  checkpoint_name?: string; // Name of the checkpoint being used
  checkpoint_steps?: number; // Number of steps in the checkpoint
  env_count?: number; // Number of parallel environments
  env_id?: number; // ID of this environment (0-indexed)
}

/**
 * Configuration for ML environment
 * Designed for NASA Lunabotics Competition objectives:
 * 1. Excavate regolith from excavation zone
 * 2. Navigate through obstacle field
 * 3. Deposit in construction zone (berm bonus)
 * 4. Return and repeat for maximum efficiency
 */
export interface MLConfig {
  max_episode_steps: number;      // Maximum steps per episode
  step_penalty: number;           // Penalty per timestep (time efficiency)
  collision_penalty: number;      // Penalty for collision (must avoid obstacles)

  // ============ PROGRESSION REWARDS (encourage full cycle) ============

  // Step 1: Grab orbs (small reward - just a hint, not the goal)
  grab_orb_reward: number;        // Small reward for picking up orbs (+0.5)

  // Step 2: Leave excavation zone with orbs
  leave_excavation_with_orbs_reward: number;  // Bonus for exiting excavation WITH orbs (+5.0)

  // Step 3: Enter obstacle zone with orbs
  enter_obstacle_with_orbs_reward: number;    // Bonus for entering obstacle zone WITH orbs (+0.0)

  // Step 4: Enter construction zone with orbs
  enter_construction_with_orbs_reward: number; // Bonus for reaching construction WITH orbs (+15.0)

  // Step 5: Deposit rewards (MAIN TASK - highest rewards)
  deposit_berm_reward: number;    // Reward for deposit in berm (+200) - BEST
  deposit_construction_reward: number; // Reward for deposit in construction (+150) - GOOD

  // Step 6: Return to excavation zone to repeat
  return_to_excavation_reward: number;  // Reward for returning to excavation after deposit (+5.0)

  // ============ PER-STEP REWARDS (continuous encouragement) ============

  // Holding orbs (per step)
  holding_orbs_in_excavation_reward: number;   // No reward for holding in excavation (0.0)
  holding_orbs_in_obstacle_reward: number;     // Small reward while transporting through obstacle (+0.05)
  holding_orbs_in_construction_reward: number; // Larger reward while in construction zone (+0.30)

  // Exploration/navigation (per step)
  distance_traveled_reward: number;            // Tiny reward per pixel traveled (+0.0001)
  leaving_starting_zone_bonus: number;         // One-time bonus for leaving starting zone (+1.0)

  // ============ PENALTIES ============

  // Drop penalties (discourage dropping in wrong zones)
  drop_excavation_penalty: number;  // Penalty for dropping in excavation (-15)
  drop_obstacle_penalty: number;    // Severe penalty for dropping in obstacle (-100, episode ends)
  drop_starting_penalty: number;    // Penalty for dropping in starting zone (-20)
  drop_none_penalty: number;        // Penalty for dropping outside zones (-25)

  // Idle/inefficiency penalties
  idle_penalty: number;                       // Penalty for not moving (-0.05)
  idle_speed_threshold: number;               // Speed below which considered idle (0.05)
  stuck_in_starting_zone_penalty: number;     // Penalty for staying in starting zone too long (-0.02/step)

  // Movement direction penalties/rewards
  backward_movement_penalty: number;          // Penalty for driving backward (-0.10/step)
  forward_movement_reward: number;            // Small reward for driving forward (+0.02/step)

  // Orb management rewards/penalties
  wasteful_drop_penalty: number;              // Penalty for dropping orb in wrong zone repeatedly (-50)
  wasteful_drop_threshold: number;            // Number of bad drops before penalty (2)
  orb_swap_reward: number;                    // Small reward for dropping to grab another nearby orb (+0.5)
  holding_orbs_outside_construction_penalty: number; // Per-step penalty for holding orbs but not in construction zone (-0.02, reduced from -0.10)
  disable_holding_penalty: boolean;           // Toggle to disable holding penalty during early learning (false = penalty enabled)

  // ============ SMOOTH CONTROL ============
  smooth_acceleration_reward: number;  // Reward for smooth speed changes (+0.05)
  smooth_turning_reward: number;       // Reward for smooth heading changes (+0.05)
  smooth_threshold: number;            // Max change to be considered smooth (0.1)

  // Speed consistency rewards
  maintaining_speed_reward: number;    // Reward for keeping speed constant (not fidgeting with throttle) (+0.03)
  maintaining_speed_threshold: number; // Max speed change to be considered "maintaining" (0.05)
  high_speed_reward: number;           // Reward for driving fast when safe (+0.04)
  high_speed_threshold: number;        // Speed considered "high" (0.7 = 70% of max)

  // Heading consistency rewards
  maintaining_heading_reward: number;    // Reward for keeping heading constant (smooth straight-line driving) (+0.03)
  maintaining_heading_threshold: number; // Max heading change to be considered "maintaining" in degrees (2.0)

  // Action oscillation penalties
  speed_oscillation_penalty: number;   // Penalty for rapid speed direction changes (-0.5)
  oscillation_window: number;          // Number of steps to check for oscillation (3)

  // ============ SHAPING REWARDS ============
  use_shaping_rewards: boolean;   // Enable distance-based shaping rewards
  shaping_reward_scale: number;   // Scale for shaping rewards (0.1)
}

/**
 * Training Preset Configurations
 * Progressive curriculum for learning in stages
 */

// STAGE 1: Foundation - Smooth Driving & Collision Avoidance
// Goal: Learn basic rover control before attempting tasks
export const STAGE_1_DRIVING_CONTROL: MLConfig = {
  max_episode_steps: 10000,
  step_penalty: -0.01,                           // Light time pressure
  collision_penalty: -200,                       // Bad but not catastrophic (still learning)

  // ============ FOCUS: MOVEMENT FUNDAMENTALS ============

  // Progression rewards - ALL DISABLED (no orbs in this stage)
  grab_orb_reward: 0.0,
  leave_excavation_with_orbs_reward: 0.0,
  enter_obstacle_with_orbs_reward: 0.0,
  enter_construction_with_orbs_reward: 0.0,
  deposit_berm_reward: 0.0,
  deposit_construction_reward: 0.0,
  return_to_excavation_reward: 0.0,

  // Holding rewards - DISABLED
  holding_orbs_in_excavation_reward: 0.0,
  holding_orbs_in_obstacle_reward: 0.0,
  holding_orbs_in_construction_reward: 0.0,

  // Exploration - encourage movement
  distance_traveled_reward: 0.001,               // Small reward for covering ground
  leaving_starting_zone_bonus: 20.0,             // Good! Explore the arena

  // Drop penalties - DISABLED
  drop_excavation_penalty: 0.0,
  drop_obstacle_penalty: 0.0,
  drop_starting_penalty: 0.0,
  drop_none_penalty: 0.0,

  // Efficiency basics
  idle_penalty: -1.0,                            // Don't just sit there
  idle_speed_threshold: 0.05,
  stuck_in_starting_zone_penalty: -0.5,          // Explore!

  // Movement habits - build good fundamentals
  backward_movement_penalty: -3.0,               // Teach forward-only driving
  forward_movement_reward: 0.1,                  // Reinforce correct direction

  // Orb management - DISABLED
  wasteful_drop_penalty: 0.0,
  wasteful_drop_threshold: 2,
  orb_swap_reward: 0.0,
  holding_orbs_outside_construction_penalty: 0.0,
  disable_holding_penalty: true,

  // ============ SMOOTH CONTROL EMPHASIS ============
  smooth_acceleration_reward: 0.5,               // Learn smooth throttle control
  smooth_turning_reward: 0.5,                    // Learn smooth steering
  smooth_threshold: 0.15,

  maintaining_speed_reward: 0.3,                 // Consistent speed = good
  maintaining_speed_threshold: 0.05,
  high_speed_reward: 0.2,                        // Confidence at speed
  high_speed_threshold: 0.6,

  maintaining_heading_reward: 0.3,               // Straight-line driving
  maintaining_heading_threshold: 3.0,

  speed_oscillation_penalty: -2.0,               // Jerky driving is bad
  oscillation_window: 3,

  // Shaping - DISABLED (pure control focus)
  use_shaping_rewards: false,
  shaping_reward_scale: 0.0
};

// STAGE 2: Obstacle Avoidance & Navigation
export const STAGE_2_NAVIGATION: MLConfig = {
  max_episode_steps: 10000,
  step_penalty: -0.05,                           // Meaningful time pressure
  collision_penalty: -200,                       // Strong collision avoidance

  // ============ FOCUS: NAVIGATE TO CONSTRUCTION ZONE ============

  // Progression rewards - navigation only, NO orbs
  grab_orb_reward: 0.0,                          // DISABLED
  leave_excavation_with_orbs_reward: 0.0,        // DISABLED
  enter_obstacle_with_orbs_reward: 0.0,          // DISABLED
  enter_construction_with_orbs_reward: 0.0,      // DISABLED (no orbs yet)
  deposit_berm_reward: 0.0,                      // DISABLED
  deposit_construction_reward: 0.0,              // DISABLED
  return_to_excavation_reward: 0.0,              // DISABLED

  // Holding rewards - DISABLED
  holding_orbs_in_excavation_reward: 0.0,
  holding_orbs_in_obstacle_reward: 0.0,
  holding_orbs_in_construction_reward: 0.0,

  // Exploration
  distance_traveled_reward: 0.0,
  leaving_starting_zone_bonus: 50.0,             // Big bonus for leaving

  // Drop penalties - DISABLED
  drop_excavation_penalty: 0.0,
  drop_obstacle_penalty: 0.0,
  drop_starting_penalty: 0.0,
  drop_none_penalty: 0.0,

  // Idle penalties
  idle_penalty: -1.0,                            // Noticeable penalty
  idle_speed_threshold: 0.05,
  stuck_in_starting_zone_penalty: -0.5,          // Get moving!

  // Movement direction
  backward_movement_penalty: -3.0,               // Strong preference forward
  forward_movement_reward: 0.5,                  // Reward forward movement

  // Orb management - DISABLED
  wasteful_drop_penalty: 0.0,
  wasteful_drop_threshold: 2,
  orb_swap_reward: 0.0,
  holding_orbs_outside_construction_penalty: 0.0,
  disable_holding_penalty: true,

  // Smooth control - keep learned behaviors
  smooth_acceleration_reward: 0.5,               // Meaningful reward
  smooth_turning_reward: 0.5,
  smooth_threshold: 0.15,

  maintaining_speed_reward: 0.3,
  maintaining_speed_threshold: 0.05,
  high_speed_reward: 0.5,                        // Reward confident fast driving
  high_speed_threshold: 0.6,

  maintaining_heading_reward: 0.3,
  maintaining_heading_threshold: 3.0,

  speed_oscillation_penalty: -2.0,               // Punish jittery control
  oscillation_window: 3,

  // ============ SHAPING - PRIMARY GOAL ============
  use_shaping_rewards: true,                     // Navigate to construction zone
  shaping_reward_scale: 10.0                     // DOMINANT signal for navigation
};

// STAGE 3: Orb Collection & Transport
export const STAGE_3_ORB_COLLECTION: MLConfig = {
  max_episode_steps: 10000,
  step_penalty: -0.05,                           // Meaningful time pressure
  collision_penalty: -300,                       // Strong penalty

  // ============ FOCUS: COLLECT ORBS & DELIVER ============

  // Progression rewards - MAIN TASK with clearer scaling
  grab_orb_reward: 20.0,                         // Good reward for pickup
  leave_excavation_with_orbs_reward: 50.0,       // Bigger bonus for leaving with orbs
  enter_obstacle_with_orbs_reward: 75.0,         // Making progress
  enter_construction_with_orbs_reward: 150.0,    // BIG - reached goal
  deposit_berm_reward: 500,                      // MASSIVE - ultimate success
  deposit_construction_reward: 400,              // HUGE - ultimate success
  return_to_excavation_reward: 50.0,             // Encourage cycling

  // Holding rewards - guide behavior
  holding_orbs_in_excavation_reward: -0.5,       // Don't linger
  holding_orbs_in_obstacle_reward: 0.3,          // Positive - good job transporting
  holding_orbs_in_construction_reward: 1.5,      // Strong positive - you're there!

  // Exploration
  distance_traveled_reward: 0.0,
  leaving_starting_zone_bonus: 30.0,             // Bigger push

  // Drop penalties - much stronger
  drop_excavation_penalty: -50,                  // Bad
  drop_obstacle_penalty: -150,                   // Very bad
  drop_starting_penalty: -75,                    // Bad
  drop_none_penalty: -75,                        // Bad

  // Idle penalties - stronger
  idle_penalty: -1.0,                            // Noticeable penalty
  idle_speed_threshold: 0.05,
  stuck_in_starting_zone_penalty: -0.5,          // Get moving

  // Movement direction - stronger signals
  backward_movement_penalty: -3.0,               // Bad habit
  forward_movement_reward: 0.3,                  // Good habit

  // Orb management - stronger
  wasteful_drop_penalty: -100,                   // Very bad
  wasteful_drop_threshold: 2,
  orb_swap_reward: 5.0,                          // Good strategy
  holding_orbs_outside_construction_penalty: -0.75, // Stronger penalty
  disable_holding_penalty: false,

  // Smooth control - still important
  smooth_acceleration_reward: 0.4,
  smooth_turning_reward: 0.4,
  smooth_threshold: 0.15,

  maintaining_speed_reward: 0.2,
  maintaining_speed_threshold: 0.05,
  high_speed_reward: 0.4,
  high_speed_threshold: 0.6,

  maintaining_heading_reward: 0.2,
  maintaining_heading_threshold: 3.0,

  speed_oscillation_penalty: -1.5,               // Punish jitter
  oscillation_window: 3,

  // Shaping - guide to goals
  use_shaping_rewards: true,
  shaping_reward_scale: 3.0                      // Stronger - help with navigation
};

// STAGE 4: Full NASA Lunabotics Task - COMPETITION-OPTIMIZED
export const STAGE_4_FULL_TASK: MLConfig = {
  max_episode_steps: 10000,
  step_penalty: -0.2,                            // STRONG time pressure (competition is timed!)
  collision_penalty: -1000,                      // CATASTROPHIC - competition disqualification risk

  // ============ NASA LUNABOTICS SCORING SYSTEM ============
  // Competition rewards: excavation → transport → precise deposition → cycling

  // Task Completion Rewards (exponential progression)
  grab_orb_reward: 15.0,                         // Good start - found regolith
  leave_excavation_with_orbs_reward: 40.0,       // Committed to transport mission
  enter_obstacle_with_orbs_reward: 0.0,          // REMOVED - was encouraging drops
  enter_construction_with_orbs_reward: 100.0,    // Reached deposition zone!

  // MAIN COMPETITION OBJECTIVES (massive rewards)
  deposit_berm_reward: 2000,                     // ULTIMATE GOAL - precise berm placement (2x construction)
  deposit_construction_reward: 1000,             // Good deposition
  return_to_excavation_reward: 150.0,            // Cycle efficiency is critical!

  // Per-step guidance (subtle)
  holding_orbs_in_excavation_reward: -2.0,       // Don't linger - transport them!
  holding_orbs_in_obstacle_reward: -0.5,         // Risk zone - move through quickly
  holding_orbs_in_construction_reward: 5.0,      // Good! You're where you should be!

  // Exploration (minimal)
  distance_traveled_reward: 0.0,                 // No reward for wandering
  leaving_starting_zone_bonus: 0.0,              // Penalty is sufficient motivation

  // Drop penalties (disaster scenarios)
  drop_excavation_penalty: -150,                 // Wasted collection effort
  drop_obstacle_penalty: -500,                   // MAJOR FAIL - blocked obstacles
  drop_starting_penalty: -200,                   // Wrong direction entirely
  drop_none_penalty: -200,                       // Lost regolith

  // Efficiency penalties
  idle_penalty: -3.0,                            // Competition is timed!
  idle_speed_threshold: 0.05,
  stuck_in_starting_zone_penalty: -8.0,          // GET TO WORK!

  // Movement optimization
  backward_movement_penalty: -8.0,               // Inefficient pathing
  forward_movement_reward: 0.0,                  // Only task completion matters

  // Orb management (encourage full loads)
  wasteful_drop_penalty: -300,                   // Multiple mistakes = severe
  wasteful_drop_threshold: 2,
  orb_swap_reward: 8.0,                          // Smart: drop 3, grab 5 = net gain
  holding_orbs_outside_construction_penalty: -2.0, // Urgency to deposit
  disable_holding_penalty: false,

  // Control quality (only penalties)
  smooth_acceleration_reward: 0.0,
  smooth_turning_reward: 0.0,
  smooth_threshold: 0.12,

  maintaining_speed_reward: 0.0,
  maintaining_speed_threshold: 0.04,
  high_speed_reward: 0.0,
  high_speed_threshold: 0.65,

  maintaining_heading_reward: 0.0,
  maintaining_heading_threshold: 2.5,

  speed_oscillation_penalty: -5.0,               // Jerky control wastes time
  oscillation_window: 3,

  // NO shaping rewards - pure task-based learning
  use_shaping_rewards: false,
  shaping_reward_scale: 0.0
};

/**
 * Default ML configuration (same as STAGE_4_FULL_TASK)
 */
export const DEFAULT_ML_CONFIG: MLConfig = STAGE_4_FULL_TASK;

/**
 * Helper function to convert MLObservation to flat array
 */
export function observationToArray(obs: MLObservation): number[] {
  return [
    obs.rover_x,
    obs.rover_y,
    obs.rover_heading,
    obs.rover_speed,
    obs.is_holding_orbs,
    obs.num_orbs_held,
    obs.in_excavation_zone,
    obs.in_construction_zone,
    obs.in_berm_zone,
    obs.in_obstacle_zone,
    obs.nearest_orb_distance,
    obs.nearest_orb_angle,
    obs.nearest_orb_in_grab_zone,
    ...obs.obstacles,  // 15 values
    obs.construction_zone_distance,
    obs.construction_zone_angle
  ];
}

/**
 * Helper function to convert flat array to MLAction
 */
export function arrayToAction(arr: number[]): MLAction {
  return {
    speed: arr[0],
    turn_rate: arr[1],
    dig_action: arr[2]
  };
}
