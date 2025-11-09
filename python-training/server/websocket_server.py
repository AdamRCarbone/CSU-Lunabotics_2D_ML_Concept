"""
WebSocket Server for Browser-Python ML Bridge
Handles communication between browser simulation and Python RL training
"""

import asyncio
import websockets
import json
import numpy as np
from typing import Optional, Callable, Dict, Any


class BrowserEnvironmentBridge:
    """Bridge between browser and Python RL agent"""

    def __init__(self, host: str = "localhost", port: int = 8765):
        self.host = host
        self.port = port
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.connected = False

        # Callback for receiving observations
        self.on_observation: Optional[Callable] = None

        # Health monitoring
        self.last_message_time = 0.0
        self.ping_task: Optional[asyncio.Task] = None

        # Restart flag for training loop
        self.restart_requested = False
        self.ready_to_train = False  # Set to True when browser sends reset
        self.training_ready = False  # Set to True when Python is ready for training

    async def start_server(self):
        """Start WebSocket server"""
        print(f"[Bridge] Starting WebSocket server on {self.host}:{self.port}")
        async with websockets.serve(self.handle_connection, self.host, self.port):
            print(f"[Bridge] Server running on ws://{self.host}:{self.port}")
            await asyncio.Future()  # Run forever

    async def handle_connection(self, websocket):
        """Handle new browser connection"""
        print(f"[Bridge] Browser connected from {websocket.remote_address}")

        # If there's already an active connection, close it first
        if self.websocket is not None and self.connected:
            print("[Bridge] Closing previous connection to accept new one")
            try:
                await self.websocket.close()
            except:
                pass
            if self.ping_task:
                self.ping_task.cancel()
                self.ping_task = None

        self.websocket = websocket
        self.connected = True
        self.last_message_time = asyncio.get_event_loop().time()

        # Start ping task for keepalive
        self.ping_task = asyncio.create_task(self.keepalive_ping())

        try:
            async for message in websocket:
                self.last_message_time = asyncio.get_event_loop().time()
                await self.handle_message(message)
        except websockets.exceptions.ConnectionClosed:
            print("[Bridge] Browser disconnected")
        except Exception as e:
            print(f"[Bridge] Connection error: {e}")
        finally:
            # Only clear if this is still the active websocket
            if self.websocket == websocket:
                self.connected = False
                self.websocket = None
            if self.ping_task:
                self.ping_task.cancel()
                self.ping_task = None

    async def keepalive_ping(self):
        """Send periodic pings to keep connection alive and detect failures"""
        try:
            while self.connected and self.websocket:
                await asyncio.sleep(10)  # Ping every 10 seconds

                if self.websocket:
                    try:
                        # Check if we've received a message recently
                        time_since_last_msg = asyncio.get_event_loop().time() - self.last_message_time

                        # If no message in 30 seconds, connection might be dead
                        if time_since_last_msg > 30:
                            print(f"[Bridge] WARNING: No message received in {time_since_last_msg:.1f}s - connection may be dead")

                        # Send ping to keep connection alive
                        await self.websocket.ping()
                    except Exception as e:
                        print(f"[Bridge] Ping failed: {e} - connection likely dead")
                        if self.websocket:
                            await self.websocket.close()
                        break
        except asyncio.CancelledError:
            pass  # Task was cancelled, that's fine

    async def handle_message(self, message: str):
        """Handle incoming message from browser"""
        try:
            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "state":
                # Received observation, reward, done, info from browser
                observation = np.array(data["observation"], dtype=np.float32)
                reward = data["reward"]
                done = data["done"]
                info = data["info"]

                # Call callback if set
                if self.on_observation:
                    await self.on_observation(observation, reward, done, info)

            elif msg_type == "reset_complete":
                # Browser completed reset - ready to start training!
                observation = np.array(data["observation"], dtype=np.float32)
                info = data["info"]

                # Signal that browser is ready to train
                self.ready_to_train = True
                print("[Bridge] Browser sent reset_complete - ready to train!")

                if self.on_observation:
                    await self.on_observation(observation, 0.0, False, info)

            elif msg_type == "restart_request":
                # Browser detected timeout/deadlock - signal restart needed
                print("\n" + "=" * 60)
                print("[Bridge] RESTART REQUEST from browser - ML is stuck!")
                print("[Bridge] Setting restart flag - training loop will restart")
                print("=" * 60 + "\n")
                self.restart_requested = True

        except Exception as e:
            print(f"[Bridge] Error handling message: {e}")

    async def send_action(self, action: np.ndarray):
        """Send action to browser"""
        if not self.connected or not self.websocket:
            raise RuntimeError("Not connected to browser")

        message = {
            "type": "action",
            "action": action.tolist()
        }

        try:
            await self.websocket.send(json.dumps(message))
        except Exception as e:
            print(f"[Bridge] Failed to send action: {e}")
            self.connected = False
            raise RuntimeError(f"Failed to send action: {e}")

    async def request_reset(self):
        """Request browser to reset environment"""
        if not self.connected or not self.websocket:
            raise RuntimeError("Not connected to browser")

        message = {
            "type": "reset_request"
        }

        await self.websocket.send(json.dumps(message))
        print("[Bridge] Reset requested")

    async def set_timescale(self, timescale: float):
        """Set simulation timescale (1.0 = normal, 2.0 = 2x speed, etc.)"""
        if not self.connected or not self.websocket:
            raise RuntimeError("Not connected to browser")

        message = {
            "type": "set_timescale",
            "timescale": timescale
        }

        await self.websocket.send(json.dumps(message))
        print(f"[Bridge] Timescale set to {timescale}x")

    async def send_checkpoint_info(self, checkpoint_name: str, checkpoint_steps: int):
        """Send checkpoint information to browser"""
        if not self.connected or not self.websocket:
            raise RuntimeError("Not connected to browser")

        message = {
            "type": "checkpoint_info",
            "checkpoint_name": checkpoint_name,
            "checkpoint_steps": checkpoint_steps
        }

        await self.websocket.send(json.dumps(message))
        print(f"[Bridge] Checkpoint info sent: {checkpoint_name} ({checkpoint_steps:,} steps)")

    async def send_parallel_training_info(self, env_count: int, env_id: int = 0):
        """Send parallel training information to browser"""
        if not self.connected or not self.websocket:
            raise RuntimeError("Not connected to browser")

        message = {
            "type": "parallel_training_info",
            "env_count": env_count,
            "env_id": env_id
        }

        await self.websocket.send(json.dumps(message))
        print(f"[Bridge] Parallel training info sent: {env_count} environments (this is env {env_id})")

    async def send_ready_to_resume(self):
        """Tell browser that Python has restarted and is ready for a reset"""
        if not self.connected or not self.websocket:
            print("[Bridge] WARNING: Cannot send ready_to_resume - not connected")
            return

        message = {
            "type": "ready_to_resume"
        }

        await self.websocket.send(json.dumps(message))
        print("[Bridge] Sent ready_to_resume signal to browser")

    def is_connected(self) -> bool:
        """Check if browser is connected"""
        return self.connected


async def test_server():
    """Test server - echo actions back"""
    bridge = BrowserEnvironmentBridge()

    async def handle_obs(obs, reward, done, info):
        print(f"[Test] Received - Obs shape: {obs.shape}, Reward: {reward:.2f}, Done: {done}")
        print(f"[Test] Info: {info}")

        # Send random action
        action = np.random.uniform(-1, 1, size=3).astype(np.float32)
        print(f"[Test] Sending action: {action}")
        await bridge.send_action(action)

        if done:
            print("[Test] Episode done, requesting reset")
            await bridge.request_reset()

    bridge.on_observation = handle_obs

    await bridge.start_server()


if __name__ == "__main__":
    # Run test server
    print("Starting test WebSocket server...")
    print("Connect your browser to ws://localhost:8765")
    asyncio.run(test_server())
