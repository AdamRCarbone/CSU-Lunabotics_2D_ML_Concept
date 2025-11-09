# Lunar Rover ML Training

Python-side reinforcement learning training for the browser-based lunar rover simulation.

## Setup

### 1. Create Virtual Environment

```bash
cd python-training
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

## Testing the Connection

### 1. Start the WebSocket Server (Test Mode)

```bash
python server/websocket_server.py
```

This will start a test server that sends random actions to the browser.

### 2. In Your Browser

Open the Angular app and enable ML training mode. The browser should connect to `ws://localhost:8765`.

### 3. Test the Environment Wrapper

```bash
python environment/browser_env.py
```

This will run a few test episodes with random actions.

## Training

### 1. Start Training

```bash
python training/train_ppo.py
```

This will:
- Start a WebSocket server on `ws://localhost:8765`
- Wait for browser connection
- Begin PPO training

### 2. Monitor Training

While training runs, you can monitor progress with TensorBoard:

```bash
tensorboard --logdir logs
```

Then open http://localhost:6006 in your browser.

### 3. Training Progress

The script will:
- Save checkpoints every 10,000 steps to `./models/`
- Log metrics to `./logs/` for TensorBoard
- Print episode statistics to console

### 4. Stop Training

Press `Ctrl+C` to stop training. The model will be saved automatically.

## Trained Models

Models are saved in `./models/` directory:
- `lunar_rover_ppo_XXXXX_steps.zip` - Checkpoint files
- `lunar_rover_ppo_final.zip` - Final trained model
- `lunar_rover_ppo_interrupted.zip` - Model saved on Ctrl+C

## Configuration

### Training Hyperparameters

Edit `training/train_ppo.py` to adjust:
- `TOTAL_TIMESTEPS` - Total training steps
- `learning_rate` - Learning rate (default: 3e-4)
- `n_steps` - Steps per update (default: 2048)
- `batch_size` - Batch size (default: 64)
- `ent_coef` - Exploration entropy (default: 0.01)

### Reward Structure

Edit reward configuration in the Angular app's ML services or via the browser UI.

## Architecture

```
Browser (Angular + Matter.js)
    ↕ WebSocket (ws://localhost:8765)
Python (Stable Baselines3 PPO)
```

**Flow:**
1. Python sends action to browser
2. Browser steps simulation, calculates reward
3. Browser sends (observation, reward, done) to Python
4. Python updates policy
5. Repeat

## Troubleshooting

### Browser won't connect
- Make sure WebSocket server is running
- Check that browser URL is `ws://localhost:8765`
- Check browser console for connection errors

### Training is slow
- Reduce `n_steps` for faster updates (but less stable)
- Use GPU if available (PPO will auto-detect)
- Disable visual rendering in browser for faster physics

### Agent not learning
- Check reward function is working (use TensorBoard)
- Try adjusting `learning_rate` or `ent_coef`
- Ensure episodes are terminating properly
- Check observation normalization

## Next Steps

- Implement curriculum learning (start easy, increase difficulty)
- Add domain randomization (random obstacle positions)
- Parallelize training with multiple browser instances
- Implement imitation learning from human demonstrations
- Export trained model to TensorFlow.js for in-browser inference
