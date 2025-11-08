# Getting Started with Headless RL Training

This guide will walk you through setting up and running the headless reinforcement learning training system for the Lunabotics rover.

## Overview

The system consists of two main components:

1. **Python Training Backend**: Headless TF-Agents PPO training with custom Gym environment
2. **Angular Monitoring Dashboard**: Real-time visualization of training metrics via WebSocket

## Prerequisites

- Python 3.8+ (you have Python 3.14.0)
- Node.js and npm (for Angular dashboard)
- At least 8GB RAM recommended
- Optional: CUDA-capable GPU for faster training

## Step 1: Set Up Python Environment

### Create Virtual Environment

```bash
cd python_training
python -m venv venv
```

### Activate Virtual Environment

**Windows:**
```bash
venv\Scripts\activate
```

**Linux/Mac:**
```bash
source venv/bin/activate
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

This will install:
- TensorFlow 2.18
- TF-Agents 0.21
- Gymnasium (OpenAI Gym replacement)
- Flask + SocketIO for WebSocket server
- TensorBoard for advanced metrics
- NumPy, matplotlib, and other utilities

**Note**: Installation may take 5-10 minutes depending on your internet speed.

## Step 2: Configure Training Parameters

Edit `python_training/config/default_config.yaml` to customize training:

```yaml
training:
  max_episodes: 10000          # Total training episodes
  max_steps_per_episode: 1000  # Max steps per episode
  learning_rate: 0.0003        # PPO learning rate
  batch_size: 512              # Training batch size
  save_interval: 1000          # Save model every N steps
```

### Key Parameters to Understand:

- **max_episodes**: How many episodes to run (start with 1000 for testing)
- **learning_rate**: How fast the agent learns (0.0003 is a good default)
- **batch_size**: Larger = more stable but slower (512 is good for PPO)
- **timescale**: Currently 1.0 (can increase for faster training since it's headless)
- **save_interval**: How often to checkpoint the model

### Reward Function Weights:

You can adjust rewards in the config to guide learning:

```yaml
rewards:
  collect_orb: 50.0              # Reward for picking up an orb
  deposit_orb: 200.0             # Reward for depositing in target berm
  collision_obstacle: -10.0      # Penalty for hitting obstacles
  time_step: -0.01               # Small penalty per step (encourages efficiency)
```

## Step 3: Start Training

### Basic Training

```bash
python train.py
```

This will:
1. Load configuration from `config/default_config.yaml`
2. Start the WebSocket metrics server on `localhost:5000`
3. Create the custom Gym environment
4. Initialize the PPO agent
5. Begin training loop

### Training with Custom Config

```bash
python train.py --config path/to/your_config.yaml
```

### What You'll See

```
Configuration loaded:
...

Starting metrics server...
Metrics server started on localhost:5000

Creating environment...
Observation spec: BoundedArraySpec(...)
Action spec: BoundedArraySpec(...)

Creating PPO agent...

============================================================
Starting training...
============================================================

[Episode     0]
  Reward:   -23.45 | Avg(100):   -23.45
  Length:  127 | Avg: 127.0
  Loss:   0.0324
  Orbs Collected: 0 | Deposited: 0
  Success Rate: 0.0%
  Steps/sec: 1250.3
  Total Steps: 127

...
```

## Step 4: Monitor Training (Angular Dashboard)

### Install Angular Dependencies

```bash
cd webapp/ml-navigation
npm install
```

### Start the Dashboard

```bash
npm start
```

Navigate to `http://localhost:4200` in your browser.

### Dashboard Features

The dashboard provides:

1. **Status Indicator**: Shows connection status and training state
2. **Control Panel**: Start/Stop training, Save model
3. **Real-time Metrics**:
   - Episode number and total steps
   - Current and average rewards
   - Training loss
   - Success rate
   - Steps per second
   - Orbs collected/deposited

4. **Charts**:
   - Reward Progress (episode reward + 100-episode moving average)
   - Training Loss over time
   - Success Rate (% of episodes with successful deposit)

### Understanding the Charts

- **Reward Progress**: You want to see this trending upward. The moving average should smooth out noise.
- **Training Loss**: Should decrease initially, then stabilize. Too low might indicate overfitting.
- **Success Rate**: Should increase as training progresses. Target: >80% for good performance.

## Step 5: Monitor with TensorBoard (Advanced)

For more detailed metrics, use TensorBoard:

```bash
cd python_training
tensorboard --logdir=./logs
```

Navigate to `http://localhost:6006`

TensorBoard shows:
- Detailed loss curves
- Network gradient statistics
- Custom scalar metrics
- Histogram distributions

## Step 6: Save and Load Models

### Automatic Saving

Models are automatically saved every `save_interval` steps (default: 1000) to:
```
python_training/checkpoints/
```

### Manual Save

Click "Save Model" in the Angular dashboard, or the trainer auto-saves the best model.

### Load Checkpoint

The training script automatically loads the latest checkpoint on startup. To start fresh:

```bash
rm -rf python_training/checkpoints/*
```

## Step 7: Understanding Training Progress

### Early Training (Episodes 0-500)

- **What to expect**: Random exploration, low/negative rewards
- **Success rate**: 0-10%
- **Reward**: Highly variable, mostly negative
- **What's happening**: Agent is learning basic controls and environment dynamics

### Mid Training (Episodes 500-2000)

- **What to expect**: Agent starts finding orbs occasionally
- **Success rate**: 10-40%
- **Reward**: Trending upward, less variance
- **What's happening**: Learning to navigate to excavation zone and collect orbs

### Late Training (Episodes 2000+)

- **What to expect**: Consistent orb collection and deposit
- **Success rate**: 40-90%+
- **Reward**: Stable high values
- **What's happening**: Fine-tuning optimal paths and strategies

### When to Stop Training

Stop when:
1. Average reward plateaus for 100+ episodes
2. Success rate reaches target (e.g., 80%)
3. Config `target_reward` is reached
4. Early stopping triggers (no improvement for `patience` episodes)

## Troubleshooting

### Issue: Python training won't start

**Check:**
- Virtual environment activated? (`venv\Scripts\activate`)
- Dependencies installed? (`pip install -r requirements.txt`)
- Port 5000 available? (Close other apps using it)

### Issue: Angular dashboard shows "Disconnected"

**Check:**
- Is Python training script running?
- Is metrics server on port 5000? (Check console output)
- Firewall blocking localhost connections?

**Fix:**
```bash
# Restart Python training
cd python_training
python train.py
```

### Issue: Training is too slow

**Speed it up:**
1. Reduce `max_steps_per_episode` (e.g., 500 instead of 1000)
2. Increase `batch_size` if you have RAM (e.g., 1024)
3. Reduce number of orbs in environment config
4. Use GPU if available (TensorFlow auto-detects)

### Issue: Reward not improving

**Possible fixes:**
1. **Lower learning rate**: Try 0.0001 instead of 0.0003
2. **Adjust rewards**: Make `deposit_orb` reward higher
3. **Check environment**: Ensure orbs are spawning in excavation zone
4. **Increase training time**: Some tasks need 5000+ episodes
5. **Try different algorithm**: SAC or TD3 (requires code changes)

### Issue: Charts not updating in dashboard

**Check:**
- WebSocket connection (status indicator should be green)
- Browser console for errors (F12 → Console)
- Refresh page

## Advanced Topics

### Hyperparameter Tuning

Key hyperparameters to experiment with:

1. **Learning Rate** (`learning_rate`):
   - Too high: unstable training
   - Too low: very slow learning
   - Try: 0.0001, 0.0003, 0.001

2. **Batch Size** (`batch_size`):
   - Larger: more stable, slower
   - Smaller: faster, noisier
   - Try: 256, 512, 1024

3. **Network Size** (`actor_fc_layers`, `value_fc_layers`):
   - Bigger: more capacity, slower
   - Smaller: faster, less capacity
   - Default `[256, 256]` is good

4. **Discount Factor** (`discount_factor`):
   - Higher (0.99): values long-term rewards
   - Lower (0.9): myopic, short-term focus

### Custom Rewards

Edit `python_training/env/lunabotics_env.py` in the `_calculate_reward()` method:

```python
# Example: Add bonus for facing excavation zone
if not self.holding_orb:
    target_direction = (excavation_center - self.rover.position).normalize()
    facing_direction = Vec2(np.cos(self.rover.angle), np.sin(self.rover.angle))
    alignment = np.dot(target_direction.to_array(), facing_direction.to_array())
    reward += alignment * 0.1  # Small bonus for facing target
```

### Algorithm Comparison

The system uses **PPO** (Proximal Policy Optimization):
- **Pros**: Stable, works well for continuous control
- **Cons**: Sample inefficient (needs many episodes)

**Alternatives to try:**
- **SAC** (Soft Actor-Critic): More sample efficient, better for sparse rewards
- **TD3** (Twin Delayed DDPG): Good for continuous control, faster than PPO
- **A3C** (Asynchronous Advantage Actor-Critic): Parallel training

To switch algorithms, edit `python_training/agents/` and modify the trainer.

## Next Steps

1. **Train your first agent**: Start with 1000 episodes to see baseline performance
2. **Analyze results**: Use TensorBoard and dashboard to understand behavior
3. **Tune hyperparameters**: Experiment with learning rate and rewards
4. **Deploy trained agent**: Load model into Angular simulation for visualization
5. **Iterate**: Refine rewards, adjust environment, retrain

## Learning Resources

### TF-Agents Documentation
- [Official Docs](https://www.tensorflow.org/agents)
- [PPO Tutorial](https://www.tensorflow.org/agents/tutorials/6_reinforce_tutorial)

### Reinforcement Learning
- [Spinning Up in Deep RL](https://spinningup.openai.com/) - OpenAI's RL guide
- [Stable Baselines3 Docs](https://stable-baselines3.readthedocs.io/) - Similar library, great concepts

### PPO Algorithm
- [Original Paper](https://arxiv.org/abs/1707.06347)
- [Explanation](https://spinningup.openai.com/en/latest/algorithms/ppo.html)

## Support

If you encounter issues:

1. Check this guide first
2. Review console output for errors
3. Check `python_training/logs/` for TensorBoard logs
4. Verify configuration in `config/default_config.yaml`

Happy training!
