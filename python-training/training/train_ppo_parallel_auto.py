"""
PPO Training Script with Parallel Environments - Auto-restart compatible
Accepts command-line arguments for unattended/overnight training
"""

import sys
import os
import glob
import webbrowser
import asyncio
import threading
import subprocess
import platform
import atexit

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from environment.browser_env import BrowserLunarRoverEnv
from server.websocket_server import BrowserEnvironmentBridge
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.vec_env import SubprocVecEnv


class ContinuingCheckpointCallback(CheckpointCallback):
    """
    Checkpoint callback that properly continues numbering from a loaded checkpoint
    """
    def __init__(self, save_freq, save_path, name_prefix, starting_timestep=0, verbose=0):
        super().__init__(save_freq, save_path, name_prefix, verbose)
        self.starting_timestep = starting_timestep

    def _on_step(self) -> bool:
        # Override to add starting_timestep to num_timesteps for checkpoint naming
        if self.n_calls % self.save_freq == 0:
            # Calculate total timesteps including starting point
            total_timesteps = self.num_timesteps + self.starting_timestep
            path = os.path.join(self.save_path, f"{self.name_prefix}_{total_timesteps}_steps")
            self.model.save(path)
            if self.verbose > 1:
                print(f"Saving model checkpoint to {path}")
        return True


def run_websocket_server(bridge):
    """Run WebSocket server in background thread"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(bridge.start_server())


def make_env(env_id, port):
    """
    Create a single environment instance for subprocess.
    Each subprocess will start its own WebSocket server.
    """
    def _init():
        # Create WebSocket bridge (each subprocess gets its own)
        bridge = BrowserEnvironmentBridge(host="localhost", port=port)

        # Start WebSocket server in background thread
        thread = threading.Thread(target=run_websocket_server, args=(bridge,), daemon=True)
        thread.start()

        # Create environment and assign the bridge
        env = BrowserLunarRoverEnv()
        env.bridge = bridge
        env = Monitor(env, f"./logs/env_{env_id}")
        return env
    return _init


def close_browser_tabs_by_url(url_pattern):
    """
    Close browser tabs matching a URL pattern
    Works on macOS by using AppleScript to close Chrome/Safari tabs
    """
    system = platform.system()

    if system == "Darwin":  # macOS
        # Try Chrome first
        applescript = f'''
        tell application "Google Chrome"
            set windowList to every window
            repeat with aWindow in windowList
                set tabList to every tab of aWindow
                repeat with atab in tabList
                    if URL of atab contains "{url_pattern}" then
                        close atab
                    end if
                end repeat
            end repeat
        end tell
        '''
        try:
            subprocess.run(['osascript', '-e', applescript],
                         stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL,
                         timeout=5)
            print(f"[Cleanup] Closed Chrome tabs matching: {url_pattern}")
        except:
            pass  # Chrome might not be running

    elif system == "Linux":
        print(f"[Cleanup] Auto-closing tabs not fully supported on Linux")
        print(f"[Cleanup] Please manually close tabs with URL: {url_pattern}")

    elif system == "Windows":
        print(f"[Cleanup] Auto-closing tabs not fully supported on Windows")
        print(f"[Cleanup] Please manually close tabs with URL: {url_pattern}")


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
    print("Lunar Rover PPO Training - Parallel Environments (Auto)")
    print("=" * 60)

    # ============ CONFIGURATION FROM COMMAND-LINE ARGS ============

    # Parse command-line arguments
    NUM_ENVS = 10  # Default: 10 parallel environments
    TOTAL_TIMESTEPS = 10_000_000  # Default: 10M steps
    MAX_EPISODE_STEPS = 5000  # Default: 5000 steps per episode
    TIMESCALE = 10.0  # Default: 10x simulation speed per environment

    if len(sys.argv) > 1:
        try:
            NUM_ENVS = int(sys.argv[1])
            if NUM_ENVS < 2:
                print(f"[Warning] NUM_ENVS must be >= 2, using default: 4")
                NUM_ENVS = 4
        except ValueError:
            print(f"[Warning] Invalid num_envs argument '{sys.argv[1]}', using default: 4")

    if len(sys.argv) > 2:
        try:
            TOTAL_TIMESTEPS = int(sys.argv[2])
        except ValueError:
            print(f"[Warning] Invalid timesteps argument '{sys.argv[2]}', using default: {TOTAL_TIMESTEPS:,}")

    if len(sys.argv) > 3:
        try:
            MAX_EPISODE_STEPS = int(sys.argv[3])
        except ValueError:
            print(f"[Warning] Invalid max_episode_steps argument '{sys.argv[3]}', using default: {MAX_EPISODE_STEPS}")

    print(f"\n[Config] Parallel environments: {NUM_ENVS}")
    print(f"[Config] Total training steps: {TOTAL_TIMESTEPS:,}")
    print(f"[Config] Max steps per episode: {MAX_EPISODE_STEPS:,}")
    print(f"[Config] Timescale per environment: {TIMESCALE}x")
    print(f"[Config] Effective speedup: ~{NUM_ENVS}x faster than single env")

    LOG_DIR = "./logs"
    MODEL_DIR = "./models"
    MODEL_NAME = "lunar_rover_ppo"
    AUTO_LOAD_LATEST = True

    # Create directories
    os.makedirs(LOG_DIR, exist_ok=True)
    os.makedirs(MODEL_DIR, exist_ok=True)

    print(f"\n[Setup] Creating {NUM_ENVS} parallel subprocess environments...")
    print(f"[Setup] Each subprocess will start its own WebSocket server...")

    print("\n" + "=" * 60)
    print(f"Creating {NUM_ENVS} parallel subprocesses")
    print("Each subprocess will run independently for true parallelization")
    print("=" * 60)

    # Create vectorized environment (SubprocVecEnv runs each env in its own process)
    env = SubprocVecEnv([make_env(i, 8765 + i) for i in range(NUM_ENVS)])

    print(f"\n[Setup] Subprocess environments created!")
    print(f"[Setup] Observation space: {env.observation_space}")
    print(f"[Setup] Action space: {env.action_space}")

    # Give subprocesses a moment to start their WebSocket servers
    print(f"\n[Setup] Waiting for WebSocket servers to start in subprocesses...")
    import time
    time.sleep(2)

    # Open browser tabs sequentially, waiting for each to connect
    print("\n[Setup] Opening browser tabs and connecting...")
    print("[Setup] NOTE: Disable Chrome tab throttling for best results:")
    print("[Setup]   chrome://flags/#expensive-background-timer-throttling")
    print("[Setup]   Set to 'Disabled' and restart Chrome")
    print()

    for i in range(NUM_ENVS):
        port = 8765 + i
        url = f"http://localhost:4200?wsPort={port}&maxSteps={MAX_EPISODE_STEPS}"

        print(f"\n[Setup] Opening tab {i+1}/{NUM_ENVS} for ws://localhost:{port}...")
        webbrowser.open(url)

        # Wait for this specific browser to connect
        print(f"[Setup] Waiting for tab {i+1} to connect...")
        env.env_method('connect', indices=[i])

        print(f"[Setup] ✓ Tab {i+1} connected! Configuring...")
        env.env_method('set_timescale', timescale=TIMESCALE, indices=[i])
        env.env_method('send_parallel_training_info', NUM_ENVS, i, indices=[i])

        print(f"[Setup] ✓ Tab {i+1} ready!")

    print("\n" + "=" * 60)
    print(f"All {NUM_ENVS} browser tabs connected and ready!")
    print("=" * 60)

    # Auto-detect latest checkpoint if enabled
    checkpoint_to_load = None
    starting_timestep = 0

    if AUTO_LOAD_LATEST:
        print("\n[Model] Searching for latest checkpoint...")
        result = find_latest_checkpoint(MODEL_DIR, MODEL_NAME)
        if result:
            checkpoint_path, checkpoint_steps = result
            checkpoint_to_load = checkpoint_path.replace(".zip", "")
            starting_timestep = checkpoint_steps
            print(f"[Model] Found latest checkpoint: {os.path.basename(checkpoint_path)}")
            print(f"[Model] Continuing from {checkpoint_steps:,} steps")
        else:
            print("[Model] No existing checkpoints found, starting fresh")

    # Create or load PPO model
    if checkpoint_to_load and os.path.exists(checkpoint_to_load + ".zip"):
        print(f"\n[Model] Loading existing model from {checkpoint_to_load}")
        model = PPO.load(
            checkpoint_to_load,
            env=env,
            verbose=1,
            tensorboard_log=LOG_DIR,
            device="auto"
        )
        print(f"[Model] Model loaded! Continuing training...")

        # Extract checkpoint info for UI
        checkpoint_name = os.path.basename(checkpoint_to_load)
        if "_" in checkpoint_name:
            try:
                steps = int(checkpoint_name.split("_")[-2].replace("steps", ""))
                env.env_method('send_checkpoint_info', checkpoint_name, steps, indices=[0])
            except:
                pass
    else:
        print("\n[Model] Creating new PPO agent...")
        model = PPO(
            "MlpPolicy",
            env,
            verbose=1,
            tensorboard_log=LOG_DIR,
            learning_rate=3e-4,
            n_steps=2048,  # Steps per update PER environment
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
        print("[Model] New PPO agent created!")

    print(f"[Model] Using device: {model.device}")

    # Callbacks
    checkpoint_callback = ContinuingCheckpointCallback(
        save_freq=10000 // NUM_ENVS,  # Adjust frequency for parallel envs (every 10k total steps)
        save_path=MODEL_DIR,
        name_prefix=MODEL_NAME,
        starting_timestep=starting_timestep,
        verbose=1
    )

    print(f"[Model] Checkpoints will be saved every {10000:,} timesteps")
    if starting_timestep > 0:
        print(f"[Model] Starting from timestep {starting_timestep:,}, next checkpoint at {starting_timestep + 10000:,}")

    # Training
    print("\n" + "=" * 60)
    print(f"Starting parallel training for {TOTAL_TIMESTEPS:,} timesteps")
    print(f"Using {NUM_ENVS} parallel environments")
    print(f"Effective speedup: ~{NUM_ENVS}x")
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

    except Exception as e:
        print(f"\n[Training] Error: {e}")
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

    # Close browser tabs
    print("\n[Cleanup] Closing browser tabs...")
    close_browser_tabs_by_url("localhost:4200")


def cleanup_on_exit():
    """Cleanup function called when script exits"""
    print("\n[Cleanup] Script exiting, closing browser tabs...")
    close_browser_tabs_by_url("localhost:4200")


if __name__ == "__main__":
    # Register cleanup function to run on exit
    atexit.register(cleanup_on_exit)

    try:
        main()
    except KeyboardInterrupt:
        print("\n[Cleanup] Received Ctrl+C, cleaning up...")
        sys.exit(0)
