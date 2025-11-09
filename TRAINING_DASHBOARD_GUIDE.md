# Training Dashboard Guide

Your Angular web app now has a **real-time training monitoring dashboard** to visualize your Python training progress!

## Quick Start

### Step 1: Start Training
```bash
cd python_training
venv\Scripts\activate
python train_sb3.py
```

The training will automatically start the metrics server on `http://localhost:5000` and begin streaming training data.

### Step 2: Open the Web Dashboard
```bash
cd webapp/ml-navigation
ng serve
```

Open your browser to `http://localhost:4200`

### Step 3: View Training Progress
1. Click the **"Training Monitor"** button at the top of the page
2. The dashboard will connect to the training server automatically
3. Watch real-time graphs and metrics update as training progresses!

---

## Dashboard Features

### Real-Time Metrics Grid
Displays current training statistics:
- **Episode**: Current episode number
- **Total Steps**: Total timesteps trained
- **Episode Reward**: Reward for latest episode
- **Avg Reward (100)**: Moving average over last 100 episodes
- **Episode Length**: Steps in latest episode
- **Loss**: Current training loss
- **Success Rate**: Percentage of successful episodes
- **Steps/sec**: Training speed (FPS)
- **Orbs Collected**: Orbs grabbed in latest episode
- **Orbs Deposited**: Orbs deposited in latest episode

### Live Charts
Three interactive Chart.js graphs:

#### 1. Reward Progress
- Blue line: Episode reward (raw, noisy)
- Red line: Average reward over 100 episodes (smoothed trend)
- Shows if your model is learning to maximize reward

#### 2. Training Loss
- Purple line: Model loss value
- Lower is generally better (model fitting better)
- Should decrease over time

#### 3. Success Rate
- Yellow filled area: % of successful episodes
- Should increase as model learns
- Based on orbs deposited > 0

### Connection Status
Top-right indicator shows:
- 🟢 **Green "Training"**: Connected and training active
- 🟠 **Orange "Idle"**: Connected but training paused
- 🔴 **Red "Disconnected"**: Not connected to training server

### Control Buttons
- **Start Training**: Begin training (when idle)
- **Stop Training**: Pause training
- **Save Model**: Trigger manual checkpoint save

---

## How It Works

### Data Flow
1. **Python Training** (`train_sb3.py`) runs PPO algorithm
2. **Metrics Server** (Flask + SocketIO on port 5000) streams data
3. **TrainingWebsocketService** in Angular connects via WebSocket
4. **TrainingMonitor Component** receives updates and refreshes graphs
5. **Chart.js** renders live-updating graphs (no animation for performance)

### Update Frequency
- Metrics are sent to the server every 10 episodes (configurable)
- WebSocket broadcasts to all connected clients immediately
- Charts update in real-time with no refresh needed

### Historical Data
- The dashboard keeps the last 500 episodes in memory
- When you first connect, it requests the last 1000 episodes from the server
- Older data is automatically trimmed to keep the UI responsive

---

## Tips

### Multiple Dashboards
You can open multiple browser tabs/windows to the dashboard - they all receive the same data.

### Training While Viewing
The training runs in a separate process, so you can:
- Start training, then open dashboard later
- Close dashboard, training continues
- Refresh page without interrupting training

### Checkpoint Monitoring
Watch for console output in the terminal:
```
[CHECKPOINT] Saved: checkpoints/model_episode_10000.zip
```

These models are auto-saved every 10,000 episodes and can be loaded in the rover control view for visual testing.

### Troubleshooting

**Dashboard shows "Disconnected"**
- Make sure `python train_sb3.py` is running
- Check terminal for "Metrics server started on localhost:5000"
- Verify no firewall is blocking localhost:5000

**Charts not updating**
- Check browser console (F12) for errors
- Verify WebSocket connection in Network tab
- Make sure training is actually running (watch terminal)

**Slow performance**
- The dashboard is optimized for 500 episodes history
- If you want more, edit `maxHistoryPoints` in `training-monitor.ts`
- Charts use `animation: { duration: 0 }` for instant updates

---

## Switching Between Views

The app has two modes accessible via top buttons:

### Rover Control
- Manual or AI control of rover
- Visual simulation of environment
- Real-time obstacle and orb detection
- Load trained models to test visually

### Training Monitor
- Real-time training metrics
- Live graphs of progress
- Training controls (start/stop/save)
- Connection status

Switch between them anytime - both views are fully independent.

---

## Next Steps

Now that you can monitor training visually:

1. **Watch the Avg Reward (100) line** - This should trend upward if learning is working
2. **Check Success Rate** - Should increase over time
3. **Compare checkpoints** - Load different episode models in Rover Control to see improvement
4. **Iterate on rewards** - If progress stalls, adjust reward parameters in `ml_config.py`

Happy training! 🚀
