# Parallel Training Guide

Train your lunar rover agent **4-8x faster** using parallel environments!

## What is Parallel Training?

Instead of running one simulation, you run multiple browser tabs in parallel. The PPO algorithm collects experience from all environments simultaneously, leading to much faster training.

## Quick Start

### Option 1: Standard Training (1 environment)
```bash
cd python-training
python training/train_ppo.py
```
- Open **1 browser tab** at `http://localhost:4200`
- Click "Connect to Python"
- Training speed: **1x**

### Option 2: Parallel Training (4 environments - **RECOMMENDED**)
```bash
cd python-training
python training/train_ppo_parallel.py
```
- Open **4 browser tabs** at `http://localhost:4200`
- Each tab connects to a different WebSocket port:
  - Tab 1: `ws://localhost:8765`
  - Tab 2: `ws://localhost:8766`
  - Tab 3: `ws://localhost:8767`
  - Tab 4: `ws://localhost:8768`
- Training speed: **~4x faster!**

## Configuration

Edit `train_ppo_parallel.py` to customize:

```python
# ============ CONFIGURATION ============
NUM_ENVS = 4  # Number of parallel environments (2-8 recommended)
TOTAL_TIMESTEPS = 1_000_000
TIMESCALE = 2.0  # Simulation speed per environment
AUTO_LOAD_LATEST = True  # Automatically load latest checkpoint if available
LOAD_MODEL = None  # Override auto-load with specific path
```

### Recommended Settings

| NUM_ENVS | Browser Tabs | Expected Speedup | RAM Usage |
|----------|--------------|------------------|-----------|
| 2        | 2            | ~2x              | Low       |
| 4        | 4            | ~4x              | Medium    |
| 6        | 6            | ~5-6x            | High      |
| 8        | 8            | ~6-7x            | Very High |

**Note**: Diminishing returns after 6-8 environments due to synchronization overhead.

## Continue Training from Checkpoint

**By default, the script automatically loads the latest checkpoint!**

The script will automatically find and load the newest model in the `models/` folder. Just run it and it will pick up where you left off.

To disable auto-loading:
```python
AUTO_LOAD_LATEST = False
```

To manually specify a checkpoint:
```python
LOAD_MODEL = "./models/lunar_rover_ppo_500000_steps"
```

Your existing models are fully compatible with parallel training!

## How It Works

1. **SubprocVecEnv**: Each environment runs in its own subprocess
2. **Multiple Browsers**: Each process connects to a separate browser tab
3. **Shared Model**: All environments train the same PPO model
4. **Experience Collection**: Parallel collection = faster learning

## Troubleshooting

### "Timeout waiting for browser response"
- Make sure all browser tabs are open and connected
- Check that each tab is connected to the correct WebSocket port
- Try reducing TIMESCALE if browser can't keep up

### "Port already in use"
- Kill any existing Python training processes
- Close all browser tabs and restart

### High CPU/RAM usage
- Reduce NUM_ENVS (try 2 or 3)
- Reduce TIMESCALE
- Close other applications

## Performance Tips

1. **Start with 4 environments** - good balance of speed and stability
2. **Use TIMESCALE=2.0** - 2x speed per environment is stable
3. **Monitor first tab** - use it to watch training progress
4. **Save checkpoints frequently** - parallel training is more intense

## Training Stages with Parallel Training

The training presets work great with parallel training:

1. **Stage 1 (Driving & Control)**: 200k steps with 4 envs = ~50k real steps
2. **Stage 2 (Navigation)**: 300k steps with 4 envs = ~75k real steps
3. **Stage 3 (Orb Collection)**: 500k steps with 4 envs = ~125k real steps
4. **Stage 4 (Full Task)**: 1M+ steps with 4 envs = ongoing training

Total training time: ~2-3 hours instead of 8-12 hours!

## Example Training Session

```bash
# Terminal 1: Start parallel training
cd python-training
python training/train_ppo_parallel.py

# Browser: Open 4 tabs at localhost:4200
# Each tab will show "Parallel Training: 4 environments" when connected

# Training output:
# [Setup] Creating 4 parallel environments...
# [Setup] Expected speedup: ~4x faster training
# [Setup] ✓ Browser tab 1 connected!
# [Setup] ✓ Browser tab 2 connected!
# [Setup] ✓ Browser tab 3 connected!
# [Setup] ✓ Browser tab 4 connected!
# Starting parallel training for 1000000 timesteps
# Using 4 parallel environments
# Effective speedup: ~4x
```

## Comparison

| Method | Environments | Real-time Speed | Time to 1M steps |
|--------|--------------|-----------------|------------------|
| Standard | 1 | 1x | ~8-10 hours |
| Parallel (2x) | 2 | ~2x | ~4-5 hours |
| **Parallel (4x)** | **4** | **~4x** | **~2-3 hours** |
| Parallel (8x) | 8 | ~6-7x | ~1.5-2 hours |

---

**Ready to train faster?** Run `python training/train_ppo_parallel.py` and open 4 browser tabs!
