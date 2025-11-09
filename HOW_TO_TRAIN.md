# How to Train Your Lunar Rover with Machine Learning

## Overview

You now have a complete RL training setup! The browser simulation acts as the environment, and Python runs the PPO agent that learns to control the rover.

## What's Been Built

### Browser (Angular) Side:
- **ML Training Panel** - Purple panel on the right with connection/training controls
- **State Aggregation** - Converts game state to observation vector (25 values)
- **Reward Calculation** - Automatic reward based on orb collection, deposits, collisions
- **WebSocket Bridge** - Communicates with Python over ws://localhost:8765
- **Environment Service** - Gym-like interface (reset/step)

### Python Side:
- **WebSocket Server** - Receives states, sends actions
- **Gymnasium Environment** - Wraps browser as standard RL environment
- **PPO Training** - Stable Baselines3 agent with hyperparameters tuned for this task
- **Logging** - TensorBoard integration for monitoring

## Step-by-Step: Your First Training Run

### 1. Install Python Dependencies

```bash
cd python-training
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Expected output:**
```
Successfully installed stable-baselines3 websockets gymnasium numpy tensorboard matplotlib...
```

---

### 2. Start Your Browser Simulation

Make sure your Angular app is running:

```bash
cd webapp/ml-navigation
npm start
```

Open http://localhost:4200

**You should see:**
- Lunar environment with rover
- ML Training panel on the right (purple header)
- Status shows "Disconnected"

---

### 3. Start Python Training

In a **new terminal** (keep browser running):

```bash
cd python-training
source venv/bin/activate  # Activate venv again
python training/train_ppo.py
```

**Expected output:**
```
============================================================
Lunar Rover PPO Training
============================================================

[Setup] Creating environment...
[Setup] Starting WebSocket server on ws://localhost:8765
[Setup] Please start your browser simulation and enable ML training mode
[Setup] The browser should connect to ws://localhost:8765
```

Python is now waiting for the browser to connect!

---

### 4. Connect Browser to Python

In your browser:

1. Click **"Connect to Python"** button in the ML Training panel
2. Status should change to "Connected" (green)
3. Click **"▶️ Start Training"** button

**What happens:**
- Browser sends initial observation to Python
- Python calculates action using PPO policy
- Browser steps simulation
- Browser sends back (observation, reward, done)
- Python updates policy
- **Repeat!**

**You should see in Python terminal:**
```
[Env] Connected to browser!
[Env] Episode 1 started
[Model] Using device: cpu
============================================================
Starting training for 100000 timesteps
============================================================
```

Training progress bar will appear!

---

### 5. Monitor Training

#### In Browser:
The ML Training panel shows **live statistics**:
- **Episodes**: How many episodes completed
- **Avg Reward**: Average reward over last 10 episodes
- **Success Rate**: % of episodes where orbs were collected
- **Last Episode**: Detailed stats for most recent episode
- **Recent Episodes**: Scrollable list of last 10 episodes

#### In Python Terminal:
You'll see episode completions:
```
[Env] Episode 1 finished - Steps: 234, Reward: -15.34, Orbs: 0
[Env] Episode 2 finished - Steps: 456, Reward: 3.21, Orbs: 2
[Env] Episode 3 finished - Steps: 389, Reward: 8.45, Orbs: 3
```

#### TensorBoard (Optional):
Open **another terminal**:

```bash
cd python-training
source venv/bin/activate
tensorboard --logdir logs
```

Then open http://localhost:6006 to see:
- Reward curves
- Episode length
- Policy loss
- Value function

---

## Understanding What You See

### Episode Flow

Each episode follows this pattern:

1. **Reset**: Rover spawns, orbs regenerate randomly
2. **Exploration**: Agent tries actions, learns from rewards
3. **Termination**: Episode ends when:
   - Collision occurs (reward: -100)
   - Max steps reached (1000 default)
   - Agent drops orb in obstacle zone (reward: -100)

### Reward Breakdown

The agent receives rewards for:

**Positive Rewards:**
- **+20** - Drop orb in berm zone (best!)
- **+15** - Drop orb in construction zone
- **+0.05/step** - Holding orbs (encourages transporting them)
- **+0.5** - Return to excavation zone after deposit
- **+0.01** - Smooth acceleration (gradual speed changes)
- **+0.01** - Smooth turning (gradual heading changes)
- **+0.0001/pixel** - Distance traveled (survival/exploration bonus)

**Negative Rewards:**
- **-0.01** - Per timestep (encourages efficiency)
- **-10** - Drop orb in excavation zone
- **-10** - Drop orb in starting zone
- **-15** - Drop orb in no zone
- **-50** - Drop orb in obstacle zone (episode ends)
- **-100** - Collision with wall/obstacle (episode ends)

**Shaping Rewards** (optional, enabled by default):
- **+0.1** - Moving toward nearest orb (when not holding orbs)
- **+0.1** - Moving toward construction zone (when holding orbs)

### What "Good" Looks Like

Early training (episodes 1-100):
- Random movement
- Lots of collisions
- Negative average reward
- Success rate: 0-10%

Mid training (episodes 100-500):
- Starts avoiding obstacles
- Occasional orb collection
- Reward trending upward
- Success rate: 20-40%

Late training (episodes 500+):
- Consistent orb collection
- Efficient navigation
- Positive average reward
- Success rate: 60-80%

---

## Controls in the ML Training Panel

### Connection Section
- **Connect to Python**: Establish WebSocket connection
- **Disconnect**: Close connection

### Training Section
- **▶️ Start Training**: Let Python control the rover
- **⏸️ Stop Training**: Return manual control to you
- **🔴 Training Active**: Indicator showing ML is in control

### Episode Statistics
- **Episodes**: Total episodes completed this session
- **Avg Reward**: Average of last 10 episodes
- **Success Rate**: % with orbs collected
- **Last Episode**: Details of most recent episode
- **Recent Episodes**: Scrollable history

### Configuration
Click **⚙️ Configuration** to expand:
- **Max Episode Steps**: Change episode length (default: 1000)
- Click **Apply Config** to use new settings

### Reset Statistics
Click "Reset Statistics" to clear episode counter and averages (doesn't affect trained model)

---

## Common Issues & Solutions

### "Python won't connect"
**Problem**: Browser shows "Disconnected" after clicking Connect

**Solution**:
1. Make sure Python training script is running
2. Check Python terminal - should say "Starting WebSocket server"
3. Try refreshing the browser page
4. Check browser console (F12) for WebSocket errors

---

### "Training is very slow"
**Problem**: Only 1-2 episodes per minute

**Solution**:
1. Training speed depends on simulation speed
2. Close TensorBoard if open (uses resources)
3. Reduce `max_episode_steps` to 500 in config
4. Consider training overnight for best results

---

### "Agent keeps crashing into walls"
**Problem**: Even after 100+ episodes, collision rate is 90%+

**Solution**:
1. This is normal early on - PPO needs ~200-500 episodes to learn
2. Check TensorBoard - is reward trending upward?
3. If completely flat after 500 episodes:
   - Reward function might be off
   - Check browser console for errors
   - Verify observations are updating (watch Detection panel)

---

### "Browser freezes during training"
**Problem**: Browser becomes unresponsive

**Solution**:
1. Open browser DevTools (F12) and check console for errors
2. Try reducing physics speed in rover.ts (YOLO = 1)
3. Refresh page and reconnect

---

## Stopping Training

### Pause Training
Click **⏸️ Stop Training** in browser
- Keeps connection open
- You can resume with **▶️ Start Training**

### Save and Exit
In Python terminal, press **Ctrl+C**

```
^C
[Training] Interrupted by user
[Training] Model saved to ./models/lunar_rover_ppo_interrupted.zip
```

Model is automatically saved!

---

## Using Your Trained Model

### Load a Saved Model

Edit `python-training/training/train_ppo.py`:

```python
# Instead of creating new model:
# model = PPO("MlpPolicy", env, ...)

# Load existing model:
model = PPO.load("./models/lunar_rover_ppo_final", env=env)

# Continue training:
model.learn(total_timesteps=50000)
```

### Evaluate Model (No Training)

Create `python-training/training/eval_model.py`:

```python
from stable_baselines3 import PPO
from environment.browser_env import BrowserLunarRoverEnv

env = BrowserLunarRoverEnv()
env.connect()

model = PPO.load("./models/lunar_rover_ppo_final")

# Run 10 evaluation episodes
for episode in range(10):
    obs, info = env.reset()
    done = False
    total_reward = 0

    while not done:
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated
        total_reward += reward

    print(f"Episode {episode + 1}: Reward = {total_reward:.2f}, Orbs = {info['orbs_collected']}")

env.close()
```

Run: `python training/eval_model.py`

---

## Next Steps

### Improve Training
1. **Adjust Rewards**: Edit `ml-reward.ts` to change reward values
2. **Add Curriculum**: Start with no obstacles, gradually add more
3. **Hyperparameter Tuning**: Edit PPO params in `train_ppo.py`
4. **Longer Training**: Try 500k-1M timesteps for best results

### Deploy Model to Browser
1. Export TensorFlow.js model from trained PPO
2. Load in browser for inference without Python
3. Run fully autonomous rover in real-time

### Advanced Features
1. **Parallel Training**: Run multiple browser instances
2. **Imitation Learning**: Record your expert demonstrations
3. **Domain Randomization**: Randomize obstacle positions/sizes
4. **Multi-Objective**: Train on time + orbs + efficiency

---

## Tips for Success

1. **Let it train overnight** - 100k steps can take hours but produces good results
2. **Watch TensorBoard** - Reward should trend upward over time
3. **Start simple** - If struggling, reduce number of obstacles or orbs
4. **Save checkpoints** - Models save every 10k steps automatically
5. **Experiment** - Try different reward values, see what works!

---

## File Locations

- **Trained Models**: `python-training/models/`
- **Training Logs**: `python-training/logs/`
- **Configuration**:
  - Python: `python-training/training/train_ppo.py`
  - Browser: ML Training Panel → Configuration
  - Rewards: `webapp/ml-navigation/src/app/services/ml-reward.ts`

---

## Questions?

Check:
1. `ML_INTEGRATION_PLAN.md` - Technical architecture
2. `python-training/README.md` - Python setup details
3. Browser console (F12) - Client-side errors
4. Python terminal - Server-side errors

**Happy Training! 🚀🤖**
