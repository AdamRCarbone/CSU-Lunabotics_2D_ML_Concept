"""
Main training script for Lunabotics RL agent.
Runs headless PPO training with real-time monitoring via WebSocket.
"""

import argparse
import yaml
import time
import numpy as np
import tensorflow as tf
from pathlib import Path

# TF-Agents imports
from tf_agents.environments import py_environment, tf_py_environment, utils
from tf_agents.specs import array_spec
from tf_agents.trajectories import time_step as ts
from tf_agents.replay_buffers import tf_uniform_replay_buffer
from tf_agents.trajectories import trajectory
from tf_agents.utils import common

# Local imports
from env.lunabotics_env import LunaboticsEnv
from agents.ppo_agent import create_ppo_agent, create_checkpointer
from utils.metrics_server import get_metrics_server, TrainingMetrics


def load_config(config_path: str) -> dict:
    """Load configuration from YAML file"""
    with open(config_path, 'r') as f:
        return yaml.safe_load(f)


class GymnasiumWrapper(py_environment.PyEnvironment):
    """Wrapper to convert Gymnasium environment to TF-Agents PyEnvironment"""

    def __init__(self, gym_env):
        super().__init__()
        self._gym_env = gym_env

        # Convert Gym spaces to TF-Agents specs
        self._observation_spec = array_spec.BoundedArraySpec(
            shape=gym_env.observation_space.shape,
            dtype=gym_env.observation_space.dtype,
            minimum=gym_env.observation_space.low,
            maximum=gym_env.observation_space.high,
            name='observation'
        )

        self._action_spec = array_spec.BoundedArraySpec(
            shape=gym_env.action_space.shape,
            dtype=gym_env.action_space.dtype,
            minimum=gym_env.action_space.low,
            maximum=gym_env.action_space.high,
            name='action'
        )

    def observation_spec(self):
        return self._observation_spec

    def action_spec(self):
        return self._action_spec

    def _reset(self):
        obs, _ = self._gym_env.reset()
        return ts.restart(obs)

    def _step(self, action):
        obs, reward, terminated, truncated, info = self._gym_env.step(action)

        if terminated:
            return ts.termination(obs, reward)
        elif truncated:
            return ts.truncation(obs, reward)
        else:
            return ts.transition(obs, reward)


def create_environment(env_config: dict, reward_config: dict):
    """Create TF-Agents wrapped environment"""

    # Create custom Gymnasium environment
    gym_env = LunaboticsEnv(env_config, reward_config)

    # Wrap with custom TF-Agents wrapper
    py_env = GymnasiumWrapper(gym_env)

    # Wrap with TF environment
    tf_env = tf_py_environment.TFPyEnvironment(py_env)

    return tf_env


def collect_episode(environment, policy, replay_buffer):
    """
    Collect one episode of experience.

    Returns:
        episode_reward: Total reward for the episode
        episode_length: Number of steps in the episode
        info: Additional episode information
    """
    time_step = environment.reset()
    episode_reward = 0.0
    episode_length = 0
    last_info = {}

    while not time_step.is_last():
        # Get action from policy
        action_step = policy.action(time_step)

        # Take step in environment
        next_time_step = environment.step(action_step.action)

        # Create trajectory for replay buffer
        traj = trajectory.from_transition(time_step, action_step, next_time_step)
        replay_buffer.add_batch(traj)

        # Update tracking
        episode_reward += next_time_step.reward.numpy()[0]
        episode_length += 1

        # Move to next step
        time_step = next_time_step

    # Get final info from environment
    py_env = environment.pyenv.envs[0]
    last_info = {
        'orbs_collected': py_env.orbs_collected,
        'orbs_deposited': py_env.orbs_deposited,
    }

    return episode_reward, episode_length, last_info


def train(config_path: str):
    """
    Main training loop.

    Args:
        config_path: Path to configuration YAML file
    """

    # Load configuration
    config = load_config(config_path)
    print("Configuration loaded:")
    print(yaml.dump(config, default_flow_style=False))

    # Set random seeds
    tf.random.set_seed(config['seed'])
    np.random.seed(config['seed'])

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

    # Create environment
    print("\nCreating environment...")
    train_env = create_environment(config['environment'], config['rewards'])

    print(f"Observation spec: {train_env.observation_spec()}")
    print(f"Action spec: {train_env.action_spec()}")

    # Create PPO agent
    print("\nCreating PPO agent...")
    agent = create_ppo_agent(
        train_env,
        learning_rate=config['training']['learning_rate'],
        actor_fc_layers=config['training']['actor_fc_layers'],
        value_fc_layers=config['training']['value_fc_layers'],
        discount_factor=config['training']['discount_factor'],
        lambda_gae=config['training']['lambda_gae'],
        num_epochs=config['training']['num_epochs'],
    )

    # Create replay buffer
    replay_buffer = tf_uniform_replay_buffer.TFUniformReplayBuffer(
        data_spec=agent.collect_data_spec,
        batch_size=train_env.batch_size,
        max_length=config['training']['replay_buffer_capacity']
    )

    # Create checkpointer
    checkpoint_manager = create_checkpointer(agent, str(checkpoint_dir))

    # Try to restore from checkpoint
    if checkpoint_manager.latest_checkpoint:
        print(f"\nRestoring from checkpoint: {checkpoint_manager.latest_checkpoint}")
        checkpoint_manager.checkpoint.restore(checkpoint_manager.latest_checkpoint)

    # TensorBoard writer
    summary_writer = tf.summary.create_file_writer(str(tensorboard_dir))

    # Training metrics
    global_step = common.get_global_step()
    episode_rewards = []
    episode_lengths = []
    success_count = 0
    total_episodes = 0
    best_avg_reward = -np.inf
    episodes_without_improvement = 0

    # Training loop
    print("\n" + "="*60)
    print("Starting training...")
    print("="*60)

    metrics_server.set_training_status(True)
    start_time = time.time()

    for episode in range(config['training']['max_episodes']):
        # Collect episode
        episode_start_time = time.time()
        episode_reward, episode_length, info = collect_episode(
            train_env,
            agent.collect_policy,
            replay_buffer
        )
        episode_time = time.time() - episode_start_time

        # Track metrics
        episode_rewards.append(episode_reward)
        episode_lengths.append(episode_length)
        total_episodes += 1

        # Success if orb was deposited
        if info['orbs_deposited'] > 0:
            success_count += 1

        # Train agent on collected data
        experience_dataset = replay_buffer.as_dataset(
            num_parallel_calls=3,
            sample_batch_size=config['training']['batch_size'],
            num_steps=2
        ).prefetch(3)

        # Run training iterations
        iterator = iter(experience_dataset)
        train_loss = 0.0
        for _ in range(config['training']['num_epochs']):
            experience, _ = next(iterator)
            loss_info = agent.train(experience)
            train_loss += loss_info.loss.numpy()

        train_loss /= config['training']['num_epochs']

        # Clear replay buffer (PPO is on-policy)
        replay_buffer.clear()

        # Increment global step
        global_step.assign_add(episode_length)

        # Calculate rolling averages
        window_size = min(100, len(episode_rewards))
        avg_reward = np.mean(episode_rewards[-window_size:])
        avg_length = np.mean(episode_lengths[-window_size:])
        success_rate = success_count / total_episodes if total_episodes > 0 else 0.0

        # Steps per second
        total_steps = int(global_step.numpy())
        elapsed_time = time.time() - start_time
        steps_per_sec = total_steps / elapsed_time if elapsed_time > 0 else 0.0

        # Log to TensorBoard
        with summary_writer.as_default():
            tf.summary.scalar('episode_reward', episode_reward, step=episode)
            tf.summary.scalar('avg_reward_100', avg_reward, step=episode)
            tf.summary.scalar('episode_length', episode_length, step=episode)
            tf.summary.scalar('train_loss', train_loss, step=episode)
            tf.summary.scalar('success_rate', success_rate, step=episode)
            tf.summary.scalar('orbs_collected', info['orbs_collected'], step=episode)
            tf.summary.scalar('orbs_deposited', info['orbs_deposited'], step=episode)

        # Send metrics to dashboard
        if episode % config['server']['update_interval'] == 0 or episode < 10:
            metrics = TrainingMetrics(
                episode=episode,
                step=total_steps,
                episode_reward=float(episode_reward),
                avg_reward_100=float(avg_reward),
                episode_length=int(episode_length),
                loss=float(train_loss),
                learning_rate=float(config['training']['learning_rate']),
                exploration_rate=0.0,  # PPO doesn't use epsilon-greedy
                orbs_collected=info['orbs_collected'],
                orbs_deposited=info['orbs_deposited'],
                success_rate=float(success_rate),
                steps_per_sec=float(steps_per_sec),
                timestamp=time.time()
            )
            metrics_server.update_metrics(metrics)

        # Console logging
        if episode % config['training']['log_interval'] == 0:
            print(f"\n[Episode {episode:5d}]")
            print(f"  Reward: {episode_reward:8.2f} | Avg(100): {avg_reward:8.2f}")
            print(f"  Length: {episode_length:4d} | Avg: {avg_length:.1f}")
            print(f"  Loss: {train_loss:8.4f}")
            print(f"  Orbs Collected: {info['orbs_collected']} | Deposited: {info['orbs_deposited']}")
            print(f"  Success Rate: {success_rate*100:.1f}%")
            print(f"  Steps/sec: {steps_per_sec:.1f}")
            print(f"  Total Steps: {total_steps}")

        # Save checkpoint
        if episode % config['training']['save_interval'] == 0 and episode > 0:
            checkpoint_manager.save(checkpoint_number=episode)
            print(f"\n✓ Checkpoint saved at episode {episode}")

        # Check for improvement
        if avg_reward > best_avg_reward:
            best_avg_reward = avg_reward
            episodes_without_improvement = 0
            # Save best model
            checkpoint_manager.save(checkpoint_number=999999)  # Special checkpoint for best
            print(f"\n★ New best average reward: {best_avg_reward:.2f}")
        else:
            episodes_without_improvement += 1

        # Early stopping checks
        if avg_reward >= config['training']['target_reward']:
            print(f"\n🎉 Target reward reached! ({avg_reward:.2f} >= {config['training']['target_reward']})")
            break

        if episodes_without_improvement >= config['training']['patience']:
            print(f"\n⏸ Early stopping: No improvement for {config['training']['patience']} episodes")
            break

    # Training complete
    print("\n" + "="*60)
    print("Training complete!")
    print("="*60)
    print(f"Total episodes: {total_episodes}")
    print(f"Best average reward: {best_avg_reward:.2f}")
    print(f"Final success rate: {success_rate*100:.1f}%")
    print(f"Total training time: {elapsed_time/3600:.2f} hours")

    # Save final checkpoint
    checkpoint_manager.save(checkpoint_number=total_episodes)
    print(f"\nFinal checkpoint saved")

    # Keep server running for dashboard access
    print("\nMetrics server still running. Press Ctrl+C to exit.")
    metrics_server.set_training_status(False)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        metrics_server.stop()


def main():
    """Entry point"""
    parser = argparse.ArgumentParser(description='Train Lunabotics RL agent')
    parser.add_argument(
        '--config',
        type=str,
        default='config/default_config.yaml',
        help='Path to configuration file'
    )

    args = parser.parse_args()

    # Run training
    train(args.config)


if __name__ == '__main__':
    main()
