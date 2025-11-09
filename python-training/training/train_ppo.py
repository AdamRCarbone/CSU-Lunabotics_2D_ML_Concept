"""
PPO Training Script for Lunar Rover
Trains a PPO agent to collect and deposit regolith orbs
"""

import sys
import os
import asyncio
import threading

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from environment.browser_env import BrowserLunarRoverEnv
from server.websocket_server import BrowserEnvironmentBridge
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback, EvalCallback
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.vec_env import DummyVecEnv
import numpy as np


def run_websocket_server(bridge):
    """Run WebSocket server in background thread"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(bridge.start_server())


def main():
    print("=" * 60)
    print("Lunar Rover PPO Training")
    print("=" * 60)

    # Configuration
    TOTAL_TIMESTEPS = 1_000_000  # Adjust based on your needs
    TIMESCALE = 2.0  # Simulation speed multiplier (1.0 = normal, 2.0 = 2x, 5.0 = 5x, etc.)
    LOG_DIR = "./logs"
    MODEL_DIR = "./models"
    MODEL_NAME = "lunar_rover_ppo"

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

    # Create PPO model
    print("\n[Model] Creating PPO agent...")

    model = PPO(
        "MlpPolicy",
        env,
        verbose=1,
        tensorboard_log=LOG_DIR,
        learning_rate=3e-4,
        n_steps=2048,  # Steps per update
        batch_size=64,
        n_epochs=10,
        gamma=0.99,  # Discount factor
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.01,  # Entropy coefficient (encourages exploration)
        vf_coef=0.5,
        max_grad_norm=0.5,
        device="auto"  # Use GPU if available
    )

    print("[Model] PPO agent created!")
    print(f"[Model] Using device: {model.device}")

    # Callbacks
    checkpoint_callback = CheckpointCallback(
        save_freq=10000,
        save_path=MODEL_DIR,
        name_prefix=MODEL_NAME
    )

    # Training
    print("\n" + "=" * 60)
    print(f"Starting training for {TOTAL_TIMESTEPS} timesteps")
    print("=" * 60)
    print()

    try:
        model.learn(
            total_timesteps=TOTAL_TIMESTEPS,
            callback=checkpoint_callback,
            progress_bar=True
        )

        # Save final model
        final_model_path = os.path.join(MODEL_DIR, f"{MODEL_NAME}_final")
        model.save(final_model_path)
        print(f"\n[Training] Model saved to {final_model_path}")

    except KeyboardInterrupt:
        print("\n[Training] Interrupted by user")

        # Save model
        interrupt_model_path = os.path.join(MODEL_DIR, f"{MODEL_NAME}_interrupted")
        model.save(interrupt_model_path)
        print(f"[Training] Model saved to {interrupt_model_path}")

    except TimeoutError as e:
        print(f"\n[Training] Browser timeout error: {e}")
        print("[Training] This usually means the browser stopped responding.")
        print("[Training] Check that the browser tab is still active and not throttled.")

        # Save model
        timeout_model_path = os.path.join(MODEL_DIR, f"{MODEL_NAME}_timeout")
        model.save(timeout_model_path)
        print(f"[Training] Model saved to {timeout_model_path}")

    except Exception as e:
        print(f"\n[Training] Unexpected error: {e}")
        import traceback
        traceback.print_exc()

        # Save model
        error_model_path = os.path.join(MODEL_DIR, f"{MODEL_NAME}_error")
        model.save(error_model_path)
        print(f"[Training] Model saved to {error_model_path}")

    print("\n" + "=" * 60)
    print("Training complete!")
    print("=" * 60)

    # Close environment
    env.close()


if __name__ == "__main__":
    main()
