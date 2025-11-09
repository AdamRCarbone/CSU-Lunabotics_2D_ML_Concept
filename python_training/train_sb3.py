"""
Simplified training script using Stable-Baselines3 (PyTorch-based).
Much easier to use than TF-Agents!
"""

import argparse
import yaml
import time
import numpy as np
from pathlib import Path

# Stable-Baselines3
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.logger import configure

# Local imports
from env.lunabotics_env import LunaboticsEnv
from utils.metrics_server import get_metrics_server, TrainingMetrics


def load_config(config_path: str) -> dict:
    """Load configuration from YAML file"""
    with open(config_path, 'r') as f:
        return yaml.safe_load(f)


class MetricsCallback(BaseCallback):
    """
    Custom callback for streaming metrics to dashboard and saving checkpoints
    """

    def __init__(self, metrics_server, config, checkpoint_dir, verbose=0):
        super().__init__(verbose)
        self.metrics_server = metrics_server
        self.config = config
        self.checkpoint_dir = Path(checkpoint_dir)
        self.episode_rewards = []
        self.episode_lengths = []
        self.episode_count = 0
        self.start_time = time.time()
        self.checkpoint_interval = 10000  # Save every 10k episodes (change this if you want)

    def _on_step(self) -> bool:
        # This is called after every step
        return True

    def _on_rollout_end(self) -> None:
        """Called at the end of each rollout (episode collection)"""
        # Get episode info from the logger
        if len(self.model.ep_info_buffer) > 0:
            # Get latest episode info
            for ep_info in self.model.ep_info_buffer:
                if ep_info not in self.episode_rewards:
                    reward = ep_info['r']
                    length = ep_info['l']

                    self.episode_rewards.append(reward)
                    self.episode_lengths.append(length)
                    self.episode_count += 1

                    # Calculate metrics
                    avg_reward = np.mean(self.episode_rewards[-100:]) if len(self.episode_rewards) >= 100 else np.mean(self.episode_rewards)

                    # Get training info
                    fps = int(self.num_timesteps / (time.time() - self.start_time))

                    # Try to get environment-specific info
                    orbs_collected = 0
                    orbs_deposited = 0
                    try:
                        env = self.training_env.envs[0].unwrapped
                        orbs_collected = env.orbs_collected
                        orbs_deposited = env.orbs_deposited
                    except:
                        pass

                    # Send metrics to dashboard
                    metrics = TrainingMetrics(
                        episode=self.episode_count,
                        step=self.num_timesteps,
                        episode_reward=float(reward),
                        avg_reward_100=float(avg_reward),
                        episode_length=int(length),
                        loss=0.0,  # SB3 doesn't expose loss easily
                        learning_rate=float(self.model.learning_rate),
                        exploration_rate=0.0,  # PPO doesn't use epsilon
                        orbs_collected=orbs_collected,
                        orbs_deposited=orbs_deposited,
                        success_rate=float(orbs_deposited > 0),
                        steps_per_sec=float(fps),
                        timestamp=time.time()
                    )
                    self.metrics_server.update_metrics(metrics)

                    # Console logging
                    if self.episode_count % self.config['training']['log_interval'] == 0:
                        print(f"\n[Episode {self.episode_count:5d}]")
                        print(f"  Reward: {reward:8.2f} | Avg(100): {avg_reward:8.2f}")
                        print(f"  Length: {length:4d}")
                        print(f"  Orbs Collected: {orbs_collected} | Deposited: {orbs_deposited}")
                        print(f"  FPS: {fps}")
                        print(f"  Total Steps: {self.num_timesteps}")

                    # Save checkpoint every N episodes
                    if self.episode_count % self.checkpoint_interval == 0:
                        checkpoint_path = self.checkpoint_dir / f"model_episode_{self.episode_count}"
                        self.model.save(checkpoint_path)
                        print(f"\n[CHECKPOINT] Saved: {checkpoint_path}.zip")


def train(config_path: str):
    """Main training loop with Stable-Baselines3"""

    # Load configuration
    config = load_config(config_path)
    print("Configuration loaded:")
    print(yaml.dump(config, default_flow_style=False))

    # Create directories
    checkpoint_dir = Path(config['training']['checkpoint_dir'])
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    tensorboard_dir = Path(config['training']['tensorboard_dir'])
    tensorboard_dir.mkdir(parents=True, exist_ok=True)

    # Start metrics server
    print("\nStarting metrics server...")
    metrics_server = get_metrics_server(
        host=config['server']['host'],
        port=config['server']['port']
    )
    metrics_server.start()
    metrics_server.update_config(config)
    metrics_server.set_training_status(True)

    # Create environment (new version doesn't need config params)
    print("\nCreating environment...")
    env = LunaboticsEnv()

    print(f"Observation space: {env.observation_space}")
    print(f"Action space: {env.action_space}")

    # Create PPO agent with Stable-Baselines3
    print("\nCreating PPO agent...")
    model = PPO(
        "MlpPolicy",
        env,
        learning_rate=config['training']['learning_rate'],
        n_steps=config['training']['max_steps_per_episode'],
        batch_size=config['training']['batch_size'],
        n_epochs=config['training']['num_epochs'],
        gamma=config['training']['discount_factor'],
        gae_lambda=config['training']['lambda_gae'],
        clip_range=0.2,
        ent_coef=0.01,
        vf_coef=0.5,
        max_grad_norm=0.5,
        verbose=1,
        tensorboard_log=str(tensorboard_dir),
        policy_kwargs=dict(
            net_arch=[dict(pi=config['training']['actor_fc_layers'],
                          vf=config['training']['value_fc_layers'])]
        )
    )

    # Create callback
    callback = MetricsCallback(metrics_server, config, checkpoint_dir)

    # Training
    print("\n" + "="*60)
    print("Starting training...")
    print("="*60)

    total_timesteps = config['training']['max_episodes'] * config['training']['max_steps_per_episode']

    try:
        model.learn(
            total_timesteps=total_timesteps,
            callback=callback,
            progress_bar=True
        )
    except KeyboardInterrupt:
        print("\n\nTraining interrupted by user")

    # Save final model with exact episode number
    print("\nSaving final model...")
    final_episode = callback.episode_count
    model.save(checkpoint_dir / f"final_model_episode_{final_episode}")
    # Also save as "final_model" for convenience
    model.save(checkpoint_dir / "final_model")

    print("\n" + "="*60)
    print("Training complete!")
    print("="*60)

    metrics_server.set_training_status(False)

    # Keep server running
    print("\nMetrics server still running. Press Ctrl+C to exit.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        metrics_server.stop()


def main():
    """Entry point"""
    parser = argparse.ArgumentParser(description='Train Lunabotics RL agent with Stable-Baselines3')
    parser.add_argument(
        '--config',
        type=str,
        default='config/default_config.yaml',
        help='Path to configuration file'
    )

    args = parser.parse_args()
    train(args.config)


if __name__ == '__main__':
    main()
