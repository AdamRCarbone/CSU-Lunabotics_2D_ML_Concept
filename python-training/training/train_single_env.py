"""
Single Environment PPO Training - Auto-restart compatible
Runs ONE environment with ONE websocket for isolated process management
"""

import sys
import os
import glob
import asyncio
import threading
import time

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from environment.browser_env import BrowserLunarRoverEnv
from server.websocket_server import BrowserEnvironmentBridge
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.monitor import Monitor


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
        try:
            steps_str = basename.replace(f"{prefix}_", "").replace("_steps.zip", "")
            steps = int(steps_str)
            checkpoint_info.append((steps, cp))
        except ValueError:
            continue

    if not checkpoint_info:
        return None

    checkpoint_info.sort(reverse=True)
    latest_steps, latest_path = checkpoint_info[0]
    return latest_path, latest_steps


def main():
    # ============ CONFIGURATION FROM COMMAND-LINE ARGS ============
    if len(sys.argv) < 4:
        print("Usage: train_single_env.py <env_id> <port> <total_timesteps> [max_episode_steps] [timescale]")
        sys.exit(1)

    ENV_ID = int(sys.argv[1])
    PORT = int(sys.argv[2])
    TOTAL_TIMESTEPS = int(sys.argv[3])
    MAX_EPISODE_STEPS = int(sys.argv[4]) if len(sys.argv) > 4 else 5000
    TIMESCALE = float(sys.argv[5]) if len(sys.argv) > 5 else 10.0

    print(f"\n[Env {ENV_ID}] Single Environment Training")
    print(f"[Env {ENV_ID}] Port: {PORT}")
    print(f"[Env {ENV_ID}] Total steps: {TOTAL_TIMESTEPS:,}")
    print(f"[Env {ENV_ID}] Max episode steps: {MAX_EPISODE_STEPS:,}")
    print(f"[Env {ENV_ID}] Timescale: {TIMESCALE}x")

    LOG_DIR = "./logs"
    MODEL_DIR = "./models"
    MODEL_NAME = "lunar_rover_ppo"
    AUTO_LOAD_LATEST = True

    # Create directories
    os.makedirs(LOG_DIR, exist_ok=True)
    os.makedirs(MODEL_DIR, exist_ok=True)

    # Create WebSocket bridge (persistent - stays alive across restarts)
    bridge = BrowserEnvironmentBridge(host="localhost", port=PORT)

    # Start WebSocket server in background thread (runs forever)
    print(f"[Env {ENV_ID}] Starting persistent WebSocket server on port {PORT}...")
    thread = threading.Thread(target=run_websocket_server, args=(bridge,), daemon=True)
    thread.start()
    time.sleep(1)  # Let server start

    # Create environment (DON'T wrap with Monitor yet - need to call connect() first)
    base_env = BrowserLunarRoverEnv()
    base_env.bridge = bridge

    print(f"[Env {ENV_ID}] Observation space: {base_env.observation_space}")
    print(f"[Env {ENV_ID}] Action space: {base_env.action_space}")

    # Wait for browser to connect (tab opened by shell script)
    print(f"\n[Env {ENV_ID}] Waiting for browser to connect on port {PORT}...")
    base_env.connect()
    print(f"[Env {ENV_ID}] Browser connected!")

    # Configure environment
    base_env.set_timescale(timescale=TIMESCALE)

    # NOW wrap with Monitor after connection is established
    env = Monitor(base_env, f"./logs/env_{ENV_ID}")

    # Main restart loop - websocket stays alive, only training restarts
    while True:
        # Clear restart flag and wait for browser to be ready
        bridge.restart_requested = False
        bridge.ready_to_train = False

        print(f"\n[Env {ENV_ID}] ========================================")
        print(f"[Env {ENV_ID}] Ready for training")
        print(f"[Env {ENV_ID}] Waiting for browser to send reset and start training...")
        print(f"[Env {ENV_ID}] ========================================\n")

        # Send ready signal to browser - tell it to reset and resume
        base_env.bridge.training_ready = True

        # Notify browser that we're ready to resume (triggers browser to send reset)
        async def notify_ready():
            await bridge.send_ready_to_resume()

        try:
            asyncio.run(notify_ready())
        except Exception as e:
            print(f"[Env {ENV_ID}] Warning: Failed to send ready_to_resume: {e}")

        # Wait for browser to send reset (indicates it's ready to train)
        print(f"[Env {ENV_ID}] Waiting for reset from browser...")
        while not bridge.ready_to_train and not bridge.restart_requested:
            time.sleep(0.1)

        # If restart requested while waiting, just loop back and wait again
        if bridge.restart_requested and not bridge.ready_to_train:
            print(f"[Env {ENV_ID}] Restart requested while waiting - resetting state and waiting again...")
            continue

        print(f"[Env {ENV_ID}] Browser ready! Starting training...")

        try:
            train_loop(ENV_ID, env, bridge, MODEL_DIR, MODEL_NAME, LOG_DIR, TOTAL_TIMESTEPS, AUTO_LOAD_LATEST)
        except KeyboardInterrupt:
            print(f"\n[Env {ENV_ID}] Interrupted by user - exiting")
            break
        except RuntimeError as e:
            # Deadlock detected - restart immediately
            if "deadlock" in str(e).lower():
                print(f"\n[Env {ENV_ID}] Deadlock exception caught: {e}")
                bridge.restart_requested = True  # Ensure flag is set
            else:
                print(f"\n[Env {ENV_ID}] Runtime error: {e}")
                import traceback
                traceback.print_exc()
        except Exception as e:
            print(f"\n[Env {ENV_ID}] Training error: {e}")
            import traceback
            traceback.print_exc()

        # Check if restart was requested
        if bridge.restart_requested:
            print(f"\n[Env {ENV_ID}] ========================================")
            print(f"[Env {ENV_ID}] RESTART REQUESTED - Stopping training")
            print(f"[Env {ENV_ID}] Websocket stays alive, waiting for browser to reconnect")
            print(f"[Env {ENV_ID}] ========================================\n")
            time.sleep(1)
            continue
        else:
            # Normal exit (training complete or error without restart flag)
            print(f"\n[Env {ENV_ID}] Training complete - exiting")
            break

    # Close environment
    env.close()
    print(f"[Env {ENV_ID}] Environment closed")


def train_loop(ENV_ID, env, bridge, MODEL_DIR, MODEL_NAME, LOG_DIR, TOTAL_TIMESTEPS, AUTO_LOAD_LATEST):
    """
    Training loop that can be restarted without killing the websocket server
    """
    # Auto-detect latest checkpoint if enabled
    checkpoint_to_load = None
    starting_timestep = 0

    if AUTO_LOAD_LATEST:
        print(f"\n[Env {ENV_ID}] Searching for latest checkpoint...")
        result = find_latest_checkpoint(MODEL_DIR, MODEL_NAME)
        if result:
            checkpoint_path, checkpoint_steps = result
            checkpoint_to_load = checkpoint_path.replace(".zip", "")
            starting_timestep = checkpoint_steps
            print(f"[Env {ENV_ID}] Found latest checkpoint: {os.path.basename(checkpoint_path)}")
            print(f"[Env {ENV_ID}] Continuing from {checkpoint_steps:,} steps")
        else:
            print(f"[Env {ENV_ID}] No existing checkpoints found, starting fresh")

    # Create or load PPO model
    if checkpoint_to_load and os.path.exists(checkpoint_to_load + ".zip"):
        print(f"\n[Env {ENV_ID}] Loading existing model from {checkpoint_to_load}")
        model = PPO.load(
            checkpoint_to_load,
            env=env,
            verbose=0,
            tensorboard_log=LOG_DIR,
            device="auto"
        )
        print(f"[Env {ENV_ID}] Model loaded! Continuing training...")

        # Send checkpoint info to browser
        checkpoint_name = os.path.basename(checkpoint_to_load)
        if "_" in checkpoint_name:
            try:
                steps = int(checkpoint_name.split("_")[-2].replace("steps", ""))
                env.send_checkpoint_info(checkpoint_name, steps)
            except:
                pass
    else:
        print(f"\n[Env {ENV_ID}] Creating new PPO agent...")
        model = PPO(
            "MlpPolicy",
            env,
            verbose=0,
            tensorboard_log=LOG_DIR,
            learning_rate=3e-4,
            n_steps=2048,
            batch_size=64,
            n_epochs=10,
            gamma=0.99,
            gae_lambda=0.95,
            clip_range=0.2,
            ent_coef=0.01,
            vf_coef=0.5,
            max_grad_norm=0.5,
            device="auto"
        )
        print(f"[Env {ENV_ID}] New PPO agent created!")

    print(f"[Env {ENV_ID}] Using device: {model.device}")

    # Training
    print(f"\n[Env {ENV_ID}] Starting training for {TOTAL_TIMESTEPS:,} timesteps")

    # Custom callback to check for restart requests AND save with correct naming
    class RestartCheckCallback(CheckpointCallback):
        def __init__(self, bridge, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.bridge = bridge

        def _on_step(self) -> bool:
            # Check for restart request from browser
            if self.bridge.restart_requested:
                print(f"\n[Env {ENV_ID}] Restart requested during training - stopping gracefully...")
                return False  # Stop training

            # Save checkpoint with correct format: lunar_rover_ppo_2710000_steps
            if self.n_calls % self.save_freq == 0:
                # Get current total steps (starting_timestep + current training steps)
                total_steps = self.num_timesteps + starting_timestep
                checkpoint_path = os.path.join(self.save_path, f"{MODEL_NAME}_{total_steps}_steps")
                self.model.save(checkpoint_path)
                if self.verbose >= 1:
                    print(f"[Env {ENV_ID}] Checkpoint saved: {MODEL_NAME}_{total_steps}_steps.zip")
                return True
            return True

    # Use custom callback (save every 10k steps)
    restart_callback = RestartCheckCallback(
        bridge,
        save_freq=10000,
        save_path=MODEL_DIR,
        name_prefix=MODEL_NAME,  # Not used in our custom _on_step but required
        verbose=1
    )

    model.learn(
        total_timesteps=TOTAL_TIMESTEPS,
        callback=restart_callback,
        progress_bar=False  # No progress bar for single env
    )

    # Save final model (only if training completed without restart request)
    if not bridge.restart_requested:
        final_steps = starting_timestep + TOTAL_TIMESTEPS
        final_model_path = os.path.join(MODEL_DIR, f"{MODEL_NAME}_{final_steps}_steps")
        model.save(final_model_path)
        print(f"\n[Env {ENV_ID}] Training complete! Model saved to {final_model_path}.zip")


if __name__ == "__main__":
    main()
