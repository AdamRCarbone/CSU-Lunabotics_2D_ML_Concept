# Quick Start Guide

## 1. Setup (First Time Only)

```bash
# Create and activate virtual environment
cd python_training
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt
```

## 2. Start Training

```bash
# Activate venv if not already active
venv\Scripts\activate

# Run training
python train.py
```

## 3. Monitor Training

In a separate terminal:

```bash
cd ../webapp/ml-navigation
npm install  # First time only
npm start
```

Open browser to `http://localhost:4200`

## 4. View Advanced Metrics (Optional)

```bash
cd python_training
tensorboard --logdir=./logs
```

Open browser to `http://localhost:6006`

## Quick Configuration

Edit `config/default_config.yaml`:

```yaml
training:
  max_episodes: 1000      # How many episodes
  learning_rate: 0.0003   # How fast to learn
  save_interval: 500      # Save every N steps

rewards:
  deposit_orb: 200.0      # Main goal reward
  collect_orb: 50.0       # Pickup reward
  collision_obstacle: -10.0  # Collision penalty
```

## Common Commands

### Fresh Start (Delete Checkpoints)

```bash
rm -rf checkpoints/*
rm -rf logs/*
```

### Change Learning Rate Quickly

```bash
python train.py  # Edit config file during training if needed
```

### Stop Training

Press `Ctrl+C` in terminal

## Expected Timeline

- **100 episodes**: ~5-10 minutes (baseline exploration)
- **1000 episodes**: ~30-60 minutes (should see improvement)
- **5000 episodes**: ~2-4 hours (good performance)
- **10000 episodes**: ~4-8 hours (optimal performance)

Times depend on your hardware. Faster with GPU.

## Interpreting Results

**Good Training:**
- Avg Reward (100): Increasing over time
- Success Rate: >50% after 2000 episodes
- Loss: Decreasing then stable
- Steps/sec: >500 (faster = better)

**Bad Training:**
- Avg Reward: Not increasing
- Success Rate: Stuck at 0%
- Loss: Increasing or unstable

**Fixes:**
- Lower learning rate
- Increase reward for `deposit_orb`
- Train longer
- Reduce `max_steps_per_episode`

## File Locations

- **Checkpoints**: `python_training/checkpoints/`
- **TensorBoard Logs**: `python_training/logs/`
- **Config**: `python_training/config/default_config.yaml`
- **Environment**: `python_training/env/lunabotics_env.py`

## Dashboard Controls

- **Start Training**: Begin or resume training
- **Stop Training**: Pause training (saves checkpoint)
- **Save Model**: Manually save current model

## Key Metrics

- **Episode Reward**: Total reward for current episode
- **Avg Reward (100)**: Moving average (smooth trend)
- **Success Rate**: % episodes with orb deposited
- **Steps/sec**: Training speed (throughput)
- **Loss**: Neural network training loss

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Dashboard disconnected | Check Python training is running |
| Training slow | Reduce max_steps_per_episode, use GPU |
| Reward not improving | Lower learning rate, train longer |
| Out of memory | Reduce batch_size |

## Next Steps

1. Run 1000 episodes to see baseline
2. Check dashboard charts
3. Adjust hyperparameters
4. Run longer training (5000+ episodes)
5. Deploy trained model

See `GETTING_STARTED.md` for detailed guide.
