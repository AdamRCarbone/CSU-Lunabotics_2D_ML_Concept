"""
Gymnasium Environment Wrapper for Browser Simulation
Wraps the browser-based physics simulation as a standard Gym environment
"""

import gymnasium as gym
import numpy as np
from gymnasium import spaces
import asyncio
from typing import Optional, Tuple, Dict, Any
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server.websocket_server import BrowserEnvironmentBridge


class BrowserLunarRoverEnv(gym.Env):
    """
    Lunar Rover Environment using browser-based physics simulation

    Observation Space:
        - Rover state (4): x, y, heading, speed
        - Digging state (2): is_holding_orbs, num_orbs_held
        - Zone info (4): in_excavation, in_construction, in_berm, in_obstacle
        - Nearest orb (3): distance, angle, in_grab_zone
        - Obstacles (15): 5 closest obstacles (distance, angle, radius) triples
        - Target zone (2): construction_zone_distance, construction_zone_angle
        Total: 30 values

    Action Space:
        - speed: -1 to 1 (continuous forward/backward)
        - turn_rate: -1 to 1 (turn left/turn right, continuous angular velocity)
        - dig_action: 0 to 1 (threshold at 0.5)
    """

    metadata = {"render_modes": ["human"]}

    def __init__(self, host: str = "localhost", port: int = 8765):
        super().__init__()

        # Define action and observation spaces
        self.action_space = spaces.Box(
            low=np.array([-1.0, -1.0, 0.0], dtype=np.float32),
            high=np.array([1.0, 1.0, 1.0], dtype=np.float32),
            shape=(3,),
            dtype=np.float32
        )

        self.observation_space = spaces.Box(
            low=-1.0,
            high=1.0,
            shape=(30,),
            dtype=np.float32
        )

        # Bridge to browser
        self.bridge = BrowserEnvironmentBridge(host, port)
        self.loop: Optional[asyncio.AbstractEventLoop] = None

        # State tracking
        self.current_obs: Optional[np.ndarray] = None
        self.current_reward: float = 0.0
        self.current_done: bool = False
        self.current_info: Dict[str, Any] = {}
        self.waiting_for_response: bool = False

        # Episode statistics
        self.episode_count: int = 0
        self.total_steps: int = 0

    def _run_async(self, coro):
        """Run async coroutine in sync context"""
        if self.loop is None:
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)

        return self.loop.run_until_complete(coro)

    async def _wait_for_observation(self):
        """Wait for observation from browser with timeout to detect deadlock"""
        self.waiting_for_response = True

        # Timeout after 5 seconds - if browser doesn't respond, something is wrong
        # This catches the deadlock on Python side so we can restart the training loop
        timeout = 5.0  # 5 seconds
        start_time = asyncio.get_event_loop().time()

        while self.waiting_for_response:
            elapsed = asyncio.get_event_loop().time() - start_time

            if elapsed > timeout:
                # Deadlock detected! Set restart flag and raise exception
                print(f"\n[Env] DEADLOCK DETECTED: No response from browser for {elapsed:.1f}s")
                print(f"[Env] Setting restart flag - training loop will restart")
                self.bridge.restart_requested = True
                raise RuntimeError(f"Browser deadlock detected after {timeout}s - restarting training loop")

            await asyncio.sleep(0.01)  # Check every 10ms

        return self.current_obs, self.current_reward, self.current_done, self.current_info

    async def _handle_observation(self, obs, reward, done, info):
        """Callback when observation received from browser"""
        self.current_obs = obs
        self.current_reward = reward
        self.current_done = done
        self.current_info = info
        self.waiting_for_response = False

    async def _connect_async(self):
        """Connect to browser (async)"""
        # Set callback
        self.bridge.on_observation = self._handle_observation

        # Wait for connection (browser must be running)
        print("[Env] Waiting for browser connection...")
        while not self.bridge.is_connected():
            await asyncio.sleep(0.1)

        print("[Env] Connected to browser!")

    def connect(self):
        """Connect to browser simulation"""
        self._run_async(self._connect_async())


    def set_timescale(self, timescale: float = 1.0):
        """Set simulation timescale (1.0 = normal, 2.0 = 2x speed, etc.)"""
        async def _set_timescale_async():
            await self.bridge.set_timescale(timescale)

        self._run_async(_set_timescale_async())

    def send_checkpoint_info(self, checkpoint_name: str, checkpoint_steps: int):
        """Send checkpoint information to browser UI"""
        async def _send_checkpoint_info_async():
            await self.bridge.send_checkpoint_info(checkpoint_name, checkpoint_steps)

        self._run_async(_send_checkpoint_info_async())

    def send_parallel_training_info(self, env_count: int, env_id: int = 0):
        """Send parallel training information to browser UI"""
        async def _send_parallel_training_info_async():
            await self.bridge.send_parallel_training_info(env_count, env_id)

        self._run_async(_send_parallel_training_info_async())

    def reset(self, seed: Optional[int] = None, options: Optional[dict] = None) -> Tuple[np.ndarray, dict]:
        """Reset environment"""
        super().reset(seed=seed)

        if seed is not None:
            np.random.seed(seed)

        async def _reset_async():
            # Request reset
            await self.bridge.request_reset()

            # Wait for initial observation
            obs, _, _, info = await self._wait_for_observation()
            return obs, info

        obs, info = self._run_async(_reset_async())

        self.episode_count += 1
        print(f"[Env] Episode {self.episode_count} started")

        return obs, info

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, dict]:
        """Take a step in the environment"""

        async def _step_async():
            # Send action to browser
            await self.bridge.send_action(action)

            # Wait for response
            obs, reward, done, info = await self._wait_for_observation()
            return obs, reward, done, info

        obs, reward, done, info = self._run_async(_step_async())

        self.total_steps += 1

        # Gymnasium returns (obs, reward, terminated, truncated, info)
        terminated = done
        truncated = False

        if done:
            if info.get('timeout'):
                print(f"[Env] Episode {self.episode_count} TIMEOUT - connection was lost")
            else:
                print(f"[Env] Episode {self.episode_count} finished - "
                      f"Steps: {info.get('episode_length', 0)}, "
                      f"Reward: {info.get('total_reward', 0):.2f}, "
                      f"Orbs: {info.get('orbs_collected', 0)}")

        return obs, reward, terminated, truncated, info

    def render(self):
        """Render environment (browser handles rendering)"""
        pass

    def close(self):
        """Clean up"""
        if self.loop:
            self.loop.close()


# Test the environment
if __name__ == "__main__":
    print("Testing Browser Environment...")

    # Create environment
    env = BrowserLunarRoverEnv()

    # Connect to browser (browser must be running!)
    env.connect()

    # Run a few episodes
    for episode in range(3):
        obs, info = env.reset()
        print(f"Initial observation shape: {obs.shape}")

        done = False
        total_reward = 0

        while not done:
            # Random action
            action = env.action_space.sample()

            obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated
            total_reward += reward

        print(f"Episode {episode + 1} finished with total reward: {total_reward:.2f}")

    env.close()
    print("Test complete!")
