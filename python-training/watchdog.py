#!/usr/bin/env python3
"""
Training Watchdog - Monitors WebSocket activity and restarts training if it stops
"""

import asyncio
import websockets
import json
import time
import sys
import os
import signal
import subprocess
from datetime import datetime

class TrainingWatchdog:
    def __init__(self, ports, restart_script, restart_delay=10):
        """
        Monitor multiple WebSocket ports for activity

        Args:
            ports: List of WebSocket ports to monitor
            restart_script: Path to training script to restart
            restart_delay: How long to wait after last message before restarting (seconds)
        """
        self.ports = ports
        self.restart_script = restart_script
        self.restart_delay = restart_delay
        self.last_activity = {}
        self.websockets = {}
        self.training_process = None
        self.monitoring = False

        for port in ports:
            self.last_activity[port] = time.time()

    async def monitor_port(self, port):
        """Monitor a single WebSocket port for messages"""
        uri = f"ws://localhost:{port}"

        while self.monitoring:
            try:
                print(f"[Watchdog] Attempting to connect to port {port}...")
                async with websockets.connect(uri, ping_interval=None) as websocket:
                    print(f"[Watchdog] ✓ Connected to port {port}")
                    self.websockets[port] = websocket

                    # Update activity on connection
                    self.last_activity[port] = time.time()

                    async for message in websocket:
                        # Update last activity time
                        self.last_activity[port] = time.time()

                        # Parse message to see what's happening
                        try:
                            data = json.loads(message)
                            msg_type = data.get('type', 'unknown')
                            timestamp = datetime.now().strftime('%H:%M:%S')
                            print(f"[Watchdog] {timestamp} Port {port}: {msg_type}")
                        except Exception as e:
                            print(f"[Watchdog] Port {port}: Got message (parse error: {e})")

            except (websockets.exceptions.ConnectionClosed,
                    websockets.exceptions.ConnectionRefusedError,
                    ConnectionRefusedError,
                    OSError) as e:
                print(f"[Watchdog] Port {port} connection failed: {e}")
                self.websockets.pop(port, None)

                # Wait before retrying
                await asyncio.sleep(2)

    async def check_activity(self):
        """Periodically check if training has stalled"""
        while self.monitoring:
            await asyncio.sleep(5)  # Check every 5 seconds

            now = time.time()
            all_stalled = True

            for port in self.ports:
                time_since_activity = now - self.last_activity[port]

                if time_since_activity < self.restart_delay:
                    all_stalled = False
                else:
                    print(f"[Watchdog] Port {port}: No activity for {time_since_activity:.1f}s")

            if all_stalled:
                print(f"\n{'='*60}")
                print(f"[Watchdog] ALL PORTS STALLED - RESTARTING TRAINING")
                print(f"[Watchdog] No activity on any port for {self.restart_delay}s")
                print(f"{'='*60}\n")

                await self.restart_training()

    async def restart_training(self):
        """Kill and restart the training process"""
        # Kill current training process
        if self.training_process:
            print("[Watchdog] Killing training process...")
            try:
                self.training_process.terminate()
                await asyncio.sleep(2)
                if self.training_process.poll() is None:
                    self.training_process.kill()
            except:
                pass

        # Wait a moment for cleanup
        await asyncio.sleep(3)

        # Restart training
        print(f"[Watchdog] Restarting training: {self.restart_script}")
        self.training_process = subprocess.Popen(
            [sys.executable, self.restart_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        # Reset activity times
        now = time.time()
        for port in self.ports:
            self.last_activity[port] = now

        print("[Watchdog] Training restarted!")

    async def run(self):
        """Start monitoring all ports"""
        print(f"[Watchdog] Starting watchdog for ports: {self.ports}")
        print(f"[Watchdog] Restart delay: {self.restart_delay}s")
        print(f"[Watchdog] Training script: {self.restart_script}")
        print()

        self.monitoring = True

        # Start training process initially
        print("[Watchdog] Starting initial training process...")
        await self.restart_training()

        # Give training time to start up
        await asyncio.sleep(5)

        # Start monitoring tasks for each port
        tasks = []
        for port in self.ports:
            task = asyncio.create_task(self.monitor_port(port))
            tasks.append(task)

        # Start activity checker
        tasks.append(asyncio.create_task(self.check_activity()))

        try:
            await asyncio.gather(*tasks)
        except KeyboardInterrupt:
            print("\n[Watchdog] Shutting down...")
            self.monitoring = False

            # Kill training process
            if self.training_process:
                print("[Watchdog] Stopping training process...")
                try:
                    self.training_process.terminate()
                    await asyncio.sleep(1)
                    if self.training_process.poll() is None:
                        self.training_process.kill()
                except:
                    pass

            # Cancel all tasks
            for task in tasks:
                task.cancel()

def main():
    if len(sys.argv) < 3:
        print("Usage: python watchdog.py <num_envs> <restart_script>")
        print("Example: python watchdog.py 4 train_ppo_parallel.py")
        sys.exit(1)

    num_envs = int(sys.argv[1])
    restart_script = sys.argv[2]
    restart_delay = int(sys.argv[3]) if len(sys.argv) > 3 else 15  # Default 15s

    # Generate port list
    ports = [8765 + i for i in range(num_envs)]

    # Create and run watchdog
    watchdog = TrainingWatchdog(ports, restart_script, restart_delay)

    try:
        asyncio.run(watchdog.run())
    except KeyboardInterrupt:
        print("\n[Watchdog] Exiting...")

if __name__ == "__main__":
    main()
