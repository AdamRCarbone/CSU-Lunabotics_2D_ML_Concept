"""
PPO Training Continuation Script for Lunar Rover
Continue training from a saved checkpoint (for models with 30-value observation space)
"""

import sys
import os
import asyncio
import threading
import glob

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from environment.browser_env import BrowserLunarRoverEnv
from server.websocket_server import BrowserEnvironmentBridge
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.vec_env import DummyVecEnv
import numpy as np


def run_websocket_server(bridge):
    """Run WebSocket server in background thread"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(bridge.start_server())


def find_latest_checkpoint(model_dir="./models", prefix="lunar_rover_ppo"):
    """Find the most recent checkpoint file by step count"""
    pattern = os.path.join(model_dir, f"{prefix}_*_steps.zip")
    checkpoints = glob.glob(pattern)

    if not checkpoints:
        return None

    # Extract step counts and sort
    checkpoint_info = []
    for cp in checkpoints:
        basename = os.path.basename(cp)
        # Extract number from filename like "lunar_rover_ppo_850000_steps.zip"
        try:
            steps_str = basename.replace(f"{prefix}_", "").replace("_steps.zip", "")
            steps = int(steps_str)
            checkpoint_info.append((steps, cp))
        except ValueError:
            continue

    if not checkpoint_info:
        return None

    # Sort by step count (highest first)
    checkpoint_info.sort(reverse=True)
    latest_steps, latest_path = checkpoint_info[0]

    return latest_path, latest_steps


def main():
    print("=" * 60)
    print("Lunar Rover PPO Training - Continue from Checkpoint")
    print("=" * 60)

    # Configuration
    # Check for command-line arguments
    ADDITIONAL_TIMESTEPS = 10_000_000  # Default: train for 10M additional steps
    MAX_EPISODE_STEPS = 5000  # Default: 5000 steps per episode

    if len(sys.argv) > 1:
        try:
            ADDITIONAL_TIMESTEPS = int(sys.argv[1])
        except ValueError:
            print(f"[Warning] Invalid steps argument '{sys.argv[1]}', using default: {ADDITIONAL_TIMESTEPS:,}")

    if len(sys.argv) > 2:
        try:
            MAX_EPISODE_STEPS = int(sys.argv[2])
        except ValueError:
            print(f"[Warning] Invalid max_episode_steps argument '{sys.argv[2]}', using default: {MAX_EPISODE_STEPS}")

    TIMESCALE = 1.0  # Simulation speed multiplier (1.0 = normal, 2.0 = 2x, 5.0 = 5x, etc.)
    LOG_DIR = "./logs"
    MODEL_DIR = "./models"
    MODEL_NAME = "lunar_rover_ppo"

    # Auto-find latest checkpoint
    print("\n[Setup] Searching for latest checkpoint...")
    result = find_latest_checkpoint(MODEL_DIR, MODEL_NAME)

    if result is None:
        print(f"\n[Error] No checkpoints found in {MODEL_DIR}")
        print("\nPlease train a model first using train_ppo.py")
        sys.exit(1)

    CHECKPOINT_PATH, checkpoint_steps = result
    print(f"[Setup] Found latest checkpoint: {os.path.basename(CHECKPOINT_PATH)}")
    print(f"[Setup] Continuing from {checkpoint_steps:,} steps")
    print(f"[Setup] Will train for {ADDITIONAL_TIMESTEPS:,} additional steps")
    print(f"[Setup] Final model will have ~{checkpoint_steps + ADDITIONAL_TIMESTEPS:,} steps")

    # Create directories
    os.makedirs(LOG_DIR, exist_ok=True)
    os.makedirs(MODEL_DIR, exist_ok=True)

    print("\n[Setup] Creating environment...")

    # Create environment bridge
    bridge = BrowserEnvironmentBridge(host="localhost", port=8765)

    # Start WebSocket server in background
    print("[Setup] Starting WebSocket server on ws://localhost:8765")
    server_thread = threading.Thread(target=run_websocket_server, args=(bridge,), daemon=True)
    server_thread.start()

    # Wait for server to start
    import time
    time.sleep(2)

    print("[Setup] Please start your browser simulation and enable ML training mode")
    print("[Setup] The browser should connect to ws://localhost:8765")
    print()

    # Create environment (this will wait for browser connection)
    def make_env():
        env = BrowserLunarRoverEnv()
        env.bridge = bridge  # Share the bridge
        env = Monitor(env, LOG_DIR)
        return env

    # For now, use single environment (can parallelize later)
    env = DummyVecEnv([make_env])

    print("\n[Setup] Environment created!")
    print(f"[Setup] Observation space: {env.observation_space}")
    print(f"[Setup] Action space: {env.action_space}")

    # Wait for browser to connect
    print("\n[Setup] Waiting for browser to connect...")
    print("[Setup] Please open http://localhost:4200 and click 'Connect to Python'")
    env.envs[0].unwrapped.connect()

    # Set timescale for faster training
    print(f"\n[Setup] Setting simulation timescale to {TIMESCALE}x")
    env.envs[0].unwrapped.set_timescale(TIMESCALE)

    # Send checkpoint info to browser UI
    checkpoint_basename = os.path.basename(CHECKPOINT_PATH)
    print(f"\n[Setup] Sending checkpoint info to browser UI...")
    env.envs[0].unwrapped.send_checkpoint_info(checkpoint_basename, checkpoint_steps)

    # Configure max episode steps via the ML environment service
    print(f"[Setup] Configuring max episode steps: {MAX_EPISODE_STEPS}")
    async def send_config():
        message = {
            "type": "set_config",
            "max_episode_steps": MAX_EPISODE_STEPS
        }
        if bridge.websocket:
            await bridge.websocket.send(json.dumps(message))

    import json
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(send_config())

    # Load existing model
    print("\n[Model] Loading PPO agent from checkpoint...")

    try:
        model = PPO.load(
            CHECKPOINT_PATH,
            env=env,
            device="auto",
            verbose=1,
            tensorboard_log=LOG_DIR
        )
        print("[Model] PPO agent loaded successfully!")
        print(f"[Model] Using device: {model.device}")
    except Exception as e:
        print(f"\n[Error] Failed to load checkpoint: {e}")
        print("\nMake sure the checkpoint is compatible with the current observation space (30 values).")
        print("Old checkpoints with 25-value observation space will not work.")
        sys.exit(1)

    # Callbacks
    checkpoint_callback = CheckpointCallback(
        save_freq=10000,
        save_path=MODEL_DIR,
        name_prefix=MODEL_NAME
    )

    # Continue training
    print("\n" + "=" * 60)
    print(f"Continuing training for {ADDITIONAL_TIMESTEPS} additional timesteps")
    print("=" * 60)
    print()

    try:
        model.learn(
            total_timesteps=ADDITIONAL_TIMESTEPS,
            callback=checkpoint_callback,
            progress_bar=True,
            reset_num_timesteps=False  # Don't reset timestep counter
        )

        # Save final model
        final_model_path = os.path.join(MODEL_DIR, f"{MODEL_NAME}_continued_final")
        model.save(final_model_path)
        print(f"\n[Training] Model saved to {final_model_path}")

    except KeyboardInterrupt:
        print("\n[Training] Interrupted by user")

        # Save model
        interrupt_model_path = os.path.join(MODEL_DIR, f"{MODEL_NAME}_interrupted")
        model.save(interrupt_model_path)
        print(f"[Training] Model saved to {interrupt_model_path}")

    print("\n" + "=" * 60)
    print("Training complete!")
    print("=" * 60)

    # Close environment
    env.close()


if __name__ == "__main__":
    main()
