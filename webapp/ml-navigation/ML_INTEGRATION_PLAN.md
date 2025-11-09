# Machine Learning Integration Plan

## Overview
Integrate reinforcement learning to control the lunar rover using a Python-to-Browser bridge architecture.

## Architecture

```
Python RL Training ←→ WebSocket/HTTP ←→ Browser Physics Sim
    (PPO/SAC)                              (Angular + Matter.js)
```

## Task Definition

### Episode Flow
1. **Phase 1**: Navigate to excavation zone (if not already there)
2. **Phase 2**: Find and grab orbs (press B when orbs in grab zone)
3. **Phase 3**: Navigate to construction/berm zone while holding orbs
4. **Phase 4**: Release orbs in target zone (press B to drop)
5. **Repeat** until time limit or all orbs collected

### Reward Structure

```typescript
Terminal Rewards (end episode):
  -100  : Collision with wall/crater/obstacle → RESET
  -100  : Drop orb in obstacle zone → RESET

Positive Rewards:
  +10   : Drop orb in berm zone (best)
  +5    : Drop orb in construction zone
  +1    : Successfully grab orb
  +0.5  : Return to start zone after successful deposit

Negative Rewards:
  -2    : Drop orb in excavation zone (small penalty)
  -0.01 : Per timestep (encourage efficiency)

Shaping Rewards (optional, help learning):
  +0.1  : Moving toward nearest orb (when no orbs held)
  +0.1  : Moving toward construction zone (when holding orbs)
```

## State Space (Observations)

Fixed-size observation vector (~25-30 values):

```typescript
Rover State (4 values):
  - rover_x: normalized 0-1
  - rover_y: normalized 0-1
  - rover_heading: normalized 0-1 (0-360° → 0-1)
  - rover_speed: -1 to 1

Digging State (2 values):
  - is_holding_orbs: 0 or 1
  - num_orbs_held: 0-15 normalized

Zone Info (4 values):
  - in_excavation_zone: 0 or 1
  - in_construction_zone: 0 or 1
  - in_berm_zone: 0 or 1
  - in_obstacle_zone: 0 or 1

Nearest Orb (3 values, zeros if none):
  - nearest_orb_distance: normalized 0-1
  - nearest_orb_angle: relative to rover heading, -1 to 1
  - nearest_orb_in_grab_zone: 0 or 1

Obstacles in Frustum (10 values - up to 5 closest):
  - obstacle_1_distance: normalized (1.0 if none)
  - obstacle_1_angle: relative angle -1 to 1
  - obstacle_2_distance, obstacle_2_angle
  - ... (pad with 1.0 and 0.0 if fewer than 5)

Target Zone Direction (2 values):
  - construction_zone_distance: normalized 0-1
  - construction_zone_angle: relative angle -1 to 1
```

## Action Space

```typescript
Continuous Actions (3 values):
  - speed: -1 to 1 (forward/backward)
  - heading: 0 to 1 (maps to 0-360°)
  - dig_action: 0 to 1 (threshold at 0.5 to trigger dig toggle)
```

## Algorithm Choice

**Recommended: PPO (Proximal Policy Optimization)**
- Handles continuous actions naturally
- Very stable for robotics tasks
- Industry standard
- Supported by Stable Baselines3

**Alternative: SAC (Soft Actor-Critic)**
- More sample efficient
- Good for continuous control
- Slightly more complex

## Implementation Steps

### Phase 1: Angular Services (Browser Side)

1. **`ml-environment.service.ts`**
   - Wraps simulation with gym-like interface
   - Methods: `reset()`, `step(action)`, `getState()`
   - Manages episode lifecycle
   - Calculates rewards

2. **`ml-state.service.ts`**
   - Aggregates current game state into observation vector
   - Normalizes all values to appropriate ranges
   - Handles variable-length arrays (obstacles, orbs)

3. **`ml-bridge.service.ts`**
   - WebSocket connection to Python training server
   - Sends states, receives actions
   - Handles reconnection logic

4. **Type Definitions**
   - `MLObservation` interface
   - `MLAction` interface
   - `MLStepResult` interface

### Phase 2: Python Training Server

1. **WebSocket Server** (Flask-SocketIO or FastAPI)
   - Receives observation from browser
   - Runs RL algorithm step
   - Sends action back
   - Logs metrics

2. **Stable Baselines3 Integration**
   - Custom Gym environment wrapper
   - PPO agent configuration
   - Training loop
   - Model checkpointing

3. **Training Utilities**
   - Reward logging
   - Episode statistics
   - TensorBoard integration
   - Model evaluation

### Phase 3: Training & Tuning

1. **Curriculum Learning** (optional)
   - Start: Navigate without obstacles
   - Stage 2: Navigate with obstacles
   - Stage 3: Grab single orb
   - Stage 4: Full task (grab + deposit)

2. **Hyperparameter Tuning**
   - Learning rate
   - Batch size
   - Network architecture
   - Reward weights

## Communication Protocol

### Browser → Python (State)
```json
{
  "observation": [0.5, 0.3, 0.25, ...],
  "reward": 0.0,
  "done": false,
  "info": {
    "episode_length": 120,
    "orbs_collected": 2,
    "zone": "construction"
  }
}
```

### Python → Browser (Action)
```json
{
  "action": [0.6, 0.75, 0.1],
  "reset": false
}
```

### Browser → Python (Reset Request)
```json
{
  "reset": true
}
```

### Python → Browser (Reset Acknowledgment)
```json
{
  "reset": true,
  "observation": [0.5, 0.5, 0.0, ...]
}
```

## File Structure

```
webapp/ml-navigation/
├── src/app/
│   ├── services/
│   │   ├── ml-environment.service.ts
│   │   ├── ml-state.service.ts
│   │   ├── ml-bridge.service.ts
│   │   └── ml-reward.service.ts
│   ├── interfaces/
│   │   └── ml-types.ts
│
python-training/
├── environment/
│   └── browser_env.py          # Custom Gym environment
├── training/
│   ├── train_ppo.py            # Main training script
│   └── eval_model.py           # Evaluation script
├── server/
│   └── websocket_server.py     # Bridge server
├── requirements.txt
└── README.md
```

## Success Metrics

### Training Metrics
- Average episode reward
- Episode length
- Success rate (orbs deposited in construction/berm)
- Collision rate

### Performance Goals
- Collect and deposit 3+ orbs per episode
- Success rate > 70%
- Collision rate < 10%

## Notes
- Keep simulation deterministic for reproducibility
- Add visualization of agent decisions (display action values)
- Log expert demonstrations for imitation learning bootstrap
- Consider adding domain randomization (random obstacle positions, orb positions)
