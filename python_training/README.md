# Lunabotics Headless RL Training

This Python package provides a headless reinforcement learning training environment for the CSU Lunabotics rover simulation.

## Architecture

- **Custom Gym Environment**: Simplified 2D physics simulation of the rover
- **TF-Agents**: TensorFlow-based RL training with PPO algorithm
- **WebSocket Server**: Real-time streaming of training metrics to Angular dashboard
- **TensorBoard**: Advanced metric visualization

## Setup

### 1. Create Virtual Environment

```bash
cd python_training
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Run Training

```bash
python train.py --config config/default_config.yaml
```

### 4. Monitor Training

Start the Angular dashboard (in separate terminal):
```bash
cd ../webapp/ml-navigation
npm start
```

Navigate to `http://localhost:4200` to view real-time training metrics.

## Project Structure

```
python_training/
├── env/
│   ├── lunabotics_env.py      # Custom Gym environment
│   └── physics.py              # Simplified 2D physics engine
├── agents/
│   ├── ppo_agent.py            # TF-Agents PPO setup
│   └── trainer.py              # Training loop
├── utils/
│   ├── rewards.py              # Reward function design
│   ├── metrics_server.py       # WebSocket server for dashboard
│   └── checkpoint_manager.py   # Model saving/loading
├── config/
│   └── default_config.yaml     # Training hyperparameters
├── train.py                    # Main training script
└── requirements.txt
```

## Configuration

Edit `config/default_config.yaml` to adjust:
- Max episodes
- Max steps per episode
- Learning rate
- Batch size
- Save frequency
- And more...

## TensorBoard

View detailed metrics:
```bash
tensorboard --logdir=./logs
```
Navigate to `http://localhost:6006`
