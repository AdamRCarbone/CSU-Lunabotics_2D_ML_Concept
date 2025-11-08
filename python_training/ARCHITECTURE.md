# Headless RL Training Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     TRAINING PIPELINE                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Python Headless Training (train.py)                   │    │
│  │                                                         │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  Custom Gym Environment                           │  │    │
│  │  │  (lunabotics_env.py)                             │  │    │
│  │  │                                                   │  │    │
│  │  │  - Rover state (position, velocity, angle)      │  │    │
│  │  │  - Zone detection (excavation, construction)    │  │    │
│  │  │  - Object spawning (rocks, craters, orbs)       │  │    │
│  │  │  - Frustum sensor simulation                    │  │    │
│  │  │  - Reward calculation                           │  │    │
│  │  │  - Episode termination logic                    │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  │                         ↕                               │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  Simplified 2D Physics Engine                     │  │    │
│  │  │  (physics.py)                                     │  │    │
│  │  │                                                   │  │    │
│  │  │  - NumPy-based rigid body simulation            │  │    │
│  │  │  - Collision detection (rect-circle)            │  │    │
│  │  │  - Velocity/force integration                   │  │    │
│  │  │  - No rendering (headless)                      │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  │                         ↕                               │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  TF-Agents PPO Agent                              │  │    │
│  │  │  (ppo_agent.py)                                   │  │    │
│  │  │                                                   │  │    │
│  │  │  Actor Network (Policy)                          │  │    │
│  │  │  ┌─────────────────────────────────┐             │  │    │
│  │  │  │ Input: Observation (28D)        │             │  │    │
│  │  │  │ Hidden: [256, 256] (tanh)       │             │  │    │
│  │  │  │ Output: Action mean + log_std   │             │  │    │
│  │  │  └─────────────────────────────────┘             │  │    │
│  │  │                                                   │  │    │
│  │  │  Value Network (Critic)                          │  │    │
│  │  │  ┌─────────────────────────────────┐             │  │    │
│  │  │  │ Input: Observation (28D)        │             │  │    │
│  │  │  │ Hidden: [256, 256] (tanh)       │             │  │    │
│  │  │  │ Output: State value             │             │  │    │
│  │  │  └─────────────────────────────────┘             │  │    │
│  │  │                                                   │  │    │
│  │  │  PPO Loss = Policy Loss + Value Loss             │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  │                         ↕                               │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  Training Loop                                    │  │    │
│  │  │                                                   │  │    │
│  │  │  1. Collect episode with policy                 │  │    │
│  │  │  2. Store transitions in replay buffer          │  │    │
│  │  │  3. Sample batch and compute advantages (GAE)   │  │    │
│  │  │  4. Update policy with PPO clipping             │  │    │
│  │  │  5. Update value network                        │  │    │
│  │  │  6. Log metrics to TensorBoard + WebSocket      │  │    │
│  │  │  7. Save checkpoint every N steps               │  │    │
│  │  │  8. Repeat                                      │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Metrics Server (metrics_server.py)                    │    │
│  │                                                         │    │
│  │  Flask + SocketIO                                      │    │
│  │  - WebSocket on ws://localhost:5000                   │    │
│  │  - REST API for control                               │    │
│  │  - Broadcast training metrics every update            │    │
│  │  - Store metrics history                              │    │
│  └────────────────────────────────────────────────────────┘    │
│                            ↕ WebSocket                          │
└────────────────────────────│─────────────────────────────────────┘
                             │
┌────────────────────────────│─────────────────────────────────────┐
│                     MONITORING DASHBOARD                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Angular Training Monitor Component                     │    │
│  │  (training-monitor.ts)                                  │    │
│  │                                                         │    │
│  │  WebSocket Service                                     │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  - Connect to ws://localhost:5000                │  │    │
│  │  │  - Subscribe to metrics updates                  │  │    │
│  │  │  - Send control commands                         │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  │                                                         │    │
│  │  Real-time Charts (Chart.js)                          │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  Reward Progress Chart                           │  │    │
│  │  │  - Episode reward (noisy)                        │  │    │
│  │  │  - 100-episode moving average (smooth trend)     │  │    │
│  │  │                                                   │  │    │
│  │  │  Loss Chart                                      │  │    │
│  │  │  - Training loss over episodes                   │  │    │
│  │  │                                                   │  │    │
│  │  │  Success Rate Chart                              │  │    │
│  │  │  - % of episodes with successful deposit         │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  │                                                         │    │
│  │  Control Panel                                         │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  [Start Training]  [Stop]  [Save Model]          │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  │                                                         │    │
│  │  Metrics Display                                       │    │
│  │  ┌──────────────────────────────────────────────────┐  │    │
│  │  │  Episode | Steps | Reward | Avg | Loss | ...    │  │    │
│  │  └──────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Training Loop (Python)

```
Start Episode
     ↓
Reset Environment → Get Initial Observation
     ↓
[Loop until done]
     ↓
Policy Network → Sample Action ~ N(μ, σ²)
     ↓
Environment.step(action) → Next Observation, Reward, Done
     ↓
Store Transition in Replay Buffer
     ↓
Calculate Reward
     ↓
[End Loop]
     ↓
Sample Batch from Buffer
     ↓
Compute GAE (Generalized Advantage Estimation)
     ↓
Update Policy with PPO Clipping Loss
     ↓
Update Value Network with MSE Loss
     ↓
Log Metrics → TensorBoard + WebSocket
     ↓
Save Checkpoint (if interval reached)
     ↓
Next Episode
```

### Observation Space (28D Vector)

```python
[
    rover_x,              # Rover position X
    rover_y,              # Rover position Y
    rover_vx,             # Rover velocity X
    rover_vy,             # Rover velocity Y
    rover_angle,          # Rover heading (radians)
    rover_angular_vel,    # Rover angular velocity
    zone,                 # Current zone ID (0-5)
    holding_orb,          # Holding orb flag (0 or 1)

    # Detected obstacles (up to 5)
    obstacle_1_dist, obstacle_1_angle,
    obstacle_2_dist, obstacle_2_angle,
    obstacle_3_dist, obstacle_3_angle,
    obstacle_4_dist, obstacle_4_angle,
    obstacle_5_dist, obstacle_5_angle,

    # Detected orbs (up to 5)
    orb_1_dist, orb_1_angle,
    orb_2_dist, orb_2_angle,
    orb_3_dist, orb_3_angle,
    orb_4_dist, orb_4_angle,
    orb_5_dist, orb_5_angle,
]
```

### Action Space (3D Continuous)

```python
[
    linear_velocity_multiplier,   # [-1, 1] → scaled to max_speed
    angular_velocity_multiplier,  # [-1, 1] → scaled to max_angular_vel
    dig_action,                   # [0, 1] → threshold at 0.5
]
```

### Reward Function

```python
reward = 0

# Time penalty (encourages efficiency)
reward += -0.01

# Goal rewards
if reached_excavation_zone:
    reward += 10.0

if collected_orb:
    reward += 50.0

if holding_orb and reached_construction_zone:
    reward += 100.0

if deposited_orb:
    reward += 200.0

# Penalties
if collision_with_obstacle:
    reward += -10.0

if collision_with_wall:
    reward += -5.0

# Shaping rewards (guide learning)
if not holding_orb:
    # Reward for moving toward excavation zone
    delta_dist = prev_dist_to_excavation - current_dist_to_excavation
    reward += delta_dist * 1.0

if holding_orb:
    # Reward for moving toward construction zone
    delta_dist = prev_dist_to_construction - current_dist_to_construction
    reward += delta_dist * 2.0
```

## Key Components Explained

### PPO (Proximal Policy Optimization)

PPO is an on-policy algorithm that:
1. Collects trajectories using current policy
2. Computes advantage estimates (how much better an action is than average)
3. Updates policy with clipped objective (prevents large updates)
4. Updates value function to better estimate returns

**Why PPO?**
- Stable training (less hyperparameter sensitivity)
- Works well with continuous action spaces
- Good sample efficiency for on-policy methods
- Industry standard for robotics

**Key Hyperparameters:**
- `learning_rate`: Step size for gradient descent (0.0003)
- `num_epochs`: How many times to reuse collected data (10)
- `lambda_gae`: GAE smoothing parameter (0.95)
- `discount_factor`: Importance of future rewards (0.99)

### Simplified Physics Engine

Instead of running Matter.js (which requires Node.js), we implemented a lightweight
NumPy-based 2D physics engine:

**Features:**
- Rigid body dynamics (position, velocity, angle, angular velocity)
- Euler integration for updates
- Rectangle-circle collision detection
- Friction and restitution (bounce)
- Wall boundaries

**Trade-offs:**
- ✅ Fast (no IPC with Node.js)
- ✅ Simple (easy to modify)
- ✅ Deterministic (reproducible)
- ❌ Less accurate than Matter.js
- ❌ No advanced physics (joints, constraints)

For RL training, approximate physics is fine since the agent learns from
whatever environment we provide.

### WebSocket Metrics Server

Uses Flask-SocketIO to stream metrics in real-time:

**Events:**
- `metrics_update`: New episode metrics
- `training_status`: Training started/stopped
- `config_updated`: Configuration changed

**REST Endpoints:**
- `GET /health`: Server status
- `GET /metrics`: Current metrics
- `POST /control/start`: Start training
- `POST /control/stop`: Stop training
- `POST /control/save`: Save model

### Angular Dashboard

Real-time visualization using:
- **Chart.js**: Line charts for time-series data
- **Socket.IO Client**: WebSocket connection
- **RxJS Observables**: Reactive data streams
- **Material Design**: Clean, responsive UI

**Chart Update Strategy:**
- Buffer last 500 episodes
- Update charts with `update('none')` for performance
- No animations (avoid lag with fast updates)

## Performance Optimization

### Training Speed

**Factors affecting speed:**
1. **Physics timestep** (`dt`): Smaller = more accurate, slower
2. **Episode length** (`max_steps_per_episode`): Longer = more data, slower
3. **Network size**: Bigger = more capacity, slower
4. **Batch size**: Larger = fewer updates, faster per episode

**Typical throughput:**
- CPU only: 500-1000 steps/sec
- GPU (CUDA): 2000-5000 steps/sec

**To speed up:**
- Reduce `max_steps_per_episode` (e.g., 500 instead of 1000)
- Increase `batch_size` (if you have RAM)
- Use GPU if available
- Simplify physics (fewer objects)

### Memory Usage

**Replay buffer**: `batch_size * num_steps * observation_size * 4 bytes`

For `batch_size=512`, `num_steps=2`, `obs_size=28`:
- ~57 KB per batch
- Negligible memory footprint

**Neural networks**: ~5-10 MB (256x256 networks)

**Total**: <100 MB typical, scales with batch size

## Configuration Guide

### Environment Config

```yaml
environment:
  world_width: 6.8    # Meters (competition field)
  world_height: 5.0   # Meters
  max_speed: 2.0      # m/s (rover speed limit)
  num_rocks: 7        # Obstacles
  num_orbs: 15        # Collectible objects
  dt: 0.0167          # 60 FPS physics
```

### Training Config

```yaml
training:
  learning_rate: 0.0003       # Lower = more stable, slower
  batch_size: 512             # Larger = more stable, more memory
  num_epochs: 10              # PPO reuse factor
  discount_factor: 0.99       # Gamma (future reward importance)
  lambda_gae: 0.95            # GAE smoothing
  actor_fc_layers: [256, 256] # Policy network size
  value_fc_layers: [256, 256] # Value network size
```

### Reward Config

```yaml
rewards:
  # Positive
  reach_excavation_zone: 10.0
  collect_orb: 50.0
  reach_construction_zone_with_orb: 100.0
  deposit_orb: 200.0

  # Negative
  collision_obstacle: -10.0
  collision_wall: -5.0

  # Shaping (small continuous rewards)
  progress_toward_excavation: 1.0
  progress_toward_construction: 2.0
  time_step: -0.01
```

## File Structure

```
python_training/
├── config/
│   └── default_config.yaml     # All hyperparameters
├── env/
│   ├── __init__.py
│   ├── lunabotics_env.py       # Gym environment
│   └── physics.py              # 2D physics engine
├── agents/
│   ├── __init__.py
│   └── ppo_agent.py            # TF-Agents PPO setup
├── utils/
│   ├── __init__.py
│   └── metrics_server.py       # WebSocket server
├── train.py                    # Main training script
├── requirements.txt            # Python dependencies
├── README.md                   # Overview
├── QUICKSTART.md              # Quick reference
└── ARCHITECTURE.md            # This file

checkpoints/                   # Saved models (auto-created)
logs/                          # TensorBoard logs (auto-created)
```

## Extending the System

### Add New Reward

Edit `env/lunabotics_env.py`:

```python
def _calculate_reward(self, action, prev_zone):
    reward = 0.0

    # Your custom reward here
    if some_condition:
        reward += 10.0

    return reward
```

### Change Network Architecture

Edit `config/default_config.yaml`:

```yaml
training:
  actor_fc_layers: [512, 512, 256]  # 3 layers
  value_fc_layers: [512, 512, 256]
```

### Try Different Algorithm

Create `agents/sac_agent.py` (SAC is more sample-efficient):

```python
from tf_agents.agents.sac import sac_agent

# Implement SAC agent setup
# Modify train.py to use SAC instead of PPO
```

### Add Custom Metrics

Edit `utils/metrics_server.py`:

```python
@dataclass
class TrainingMetrics:
    # Add new field
    custom_metric: float = 0.0
```

Update dashboard to display it.

## Debugging

### Enable Verbose Logging

Edit `train.py`:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Visualize Environment State

Add to `env/lunabotics_env.py`:

```python
def render(self):
    import matplotlib.pyplot as plt
    plt.scatter(self.rover.position.x, self.rover.position.y)
    plt.show()
```

Call `env.render()` after each step.

### TensorBoard Profiling

```bash
tensorboard --logdir=logs --profile_plugin true
```

## Best Practices

1. **Start simple**: Train with fewer orbs, simpler rewards
2. **Monitor closely**: Watch charts in first 100 episodes
3. **Tune incrementally**: Change one hyperparameter at a time
4. **Save checkpoints**: Don't lose progress
5. **Use TensorBoard**: Understand what's happening
6. **Experiment**: Try different rewards, network sizes
7. **Document changes**: Note what works in comments

## Common Pitfalls

1. **Reward too sparse**: Agent never gets positive reward → Add shaping
2. **Learning rate too high**: Unstable training → Lower it
3. **Episodes too long**: Slow training → Reduce max_steps
4. **Reward not normalized**: PPO struggles → Enable normalize_rewards
5. **Insufficient training**: Expecting results too early → Train longer

## Future Enhancements

Potential improvements:

1. **Curriculum learning**: Start easy, increase difficulty
2. **Parallel environments**: Train multiple envs simultaneously
3. **Transfer learning**: Pre-train on simpler task
4. **Imitation learning**: Bootstrap with human demonstrations
5. **Multi-agent**: Multiple rovers cooperating
6. **Domain randomization**: Randomize physics for robustness

---

This architecture enables rapid experimentation with minimal overhead.
The headless design allows training at maximum speed while providing
real-time visibility into the learning process.
