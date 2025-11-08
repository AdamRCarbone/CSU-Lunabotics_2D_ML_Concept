"""
Play a trained model with visualization.
This shows you how the trained agent performs in the environment.
"""

import argparse
import yaml
import time
from stable_baselines3 import PPO
from env.lunabotics_env import LunaboticsEnv


def load_config(config_path: str) -> dict:
    """Load configuration from YAML file"""
    with open(config_path, 'r') as f:
        return yaml.safe_load(f)


def play_model(model_path: str, config_path: str, num_episodes: int = 5):
    """
    Load a trained model and watch it play.

    Args:
        model_path: Path to the .zip model file (without .zip extension)
        config_path: Path to config file
        num_episodes: Number of episodes to run
    """

    # Load config
    config = load_config(config_path)

    # Create environment
    env = LunaboticsEnv(config['environment'], config['rewards'])

    # Load trained model
    print(f"Loading model from: {model_path}.zip")
    model = PPO.load(model_path)

    print(f"\nRunning {num_episodes} episodes with trained agent...\n")

    for episode in range(num_episodes):
        obs, _ = env.reset()
        episode_reward = 0
        episode_length = 0
        done = False

        print(f"Episode {episode + 1}:")

        while not done:
            # Get action from trained policy
            action, _states = model.predict(obs, deterministic=True)

            # Take step
            obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated

            episode_reward += reward
            episode_length += 1

            # Optional: Add small delay to "watch" the agent (slows down execution)
            # time.sleep(0.01)

        print(f"  Reward: {episode_reward:.2f}")
        print(f"  Length: {episode_length} steps")
        print(f"  Orbs Collected: {env.orbs_collected}")
        print(f"  Orbs Deposited: {env.orbs_deposited}")
        print(f"  Success: {'YES' if env.orbs_deposited > 0 else 'NO'}")
        print()

    env.close()
    print("Done!")


def main():
    parser = argparse.ArgumentParser(description='Play a trained model')
    parser.add_argument(
        '--model',
        type=str,
        required=True,
        help='Path to model file (without .zip extension)'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='config/default_config.yaml',
        help='Path to config file'
    )
    parser.add_argument(
        '--episodes',
        type=int,
        default=5,
        help='Number of episodes to run'
    )

    args = parser.parse_args()
    play_model(args.model, args.config, args.episodes)


if __name__ == '__main__':
    main()
