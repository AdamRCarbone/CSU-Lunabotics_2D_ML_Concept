"""
TF-Agents PPO (Proximal Policy Optimization) agent setup.
"""

import tensorflow as tf
from tf_agents.agents.ppo import ppo_clip_agent
from tf_agents.networks import actor_distribution_network, value_network
from tf_agents.specs import tensor_spec
from tf_agents.trajectories import time_step as ts
from typing import Dict


def create_ppo_agent(
    env,
    learning_rate: float,
    actor_fc_layers: list,
    value_fc_layers: list,
    discount_factor: float,
    lambda_gae: float,
    num_epochs: int,
) -> ppo_clip_agent.PPOClipAgent:
    """
    Create a PPO agent for the Lunabotics environment.

    Args:
        env: The TF-Agents environment
        learning_rate: Learning rate for the optimizer
        actor_fc_layers: Hidden layer sizes for actor network
        value_fc_layers: Hidden layer sizes for value network
        discount_factor: Discount factor (gamma)
        lambda_gae: GAE lambda parameter
        num_epochs: Number of epochs for PPO updates

    Returns:
        PPO agent
    """

    # Get specs from environment
    observation_spec = tensor_spec.from_spec(env.observation_spec())
    action_spec = tensor_spec.from_spec(env.action_spec())
    time_step_spec = ts.time_step_spec(observation_spec)

    # Create actor network (policy)
    actor_net = actor_distribution_network.ActorDistributionNetwork(
        observation_spec,
        action_spec,
        fc_layer_params=tuple(actor_fc_layers),
        activation_fn=tf.keras.activations.tanh
    )

    # Create value network (critic)
    value_net = value_network.ValueNetwork(
        observation_spec,
        fc_layer_params=tuple(value_fc_layers),
        activation_fn=tf.keras.activations.tanh
    )

    # Create optimizer
    optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)

    # Create PPO agent
    agent = ppo_clip_agent.PPOClipAgent(
        time_step_spec,
        action_spec,
        optimizer=optimizer,
        actor_net=actor_net,
        value_net=value_net,
        num_epochs=num_epochs,
        discount_factor=discount_factor,
        lambda_value=lambda_gae,
        importance_ratio_clipping=0.2,  # PPO clipping parameter
        normalize_observations=True,
        normalize_rewards=True,
        use_gae=True,
        use_td_lambda_return=True,
        gradient_clipping=0.5,
        entropy_regularization=0.01,  # Encourage exploration
        value_pred_loss_coef=0.5,
        # Log metrics
        debug_summaries=True,
        summarize_grads_and_vars=True,
    )

    agent.initialize()

    return agent


def create_checkpointer(agent, checkpoint_dir: str):
    """
    Create a checkpointer to save/load agent.

    Args:
        agent: The TF-Agents agent
        checkpoint_dir: Directory to save checkpoints

    Returns:
        Checkpointer
    """
    from tf_agents.utils import common

    checkpoint = tf.train.Checkpoint(
        agent=agent,
        global_step=common.get_global_step()
    )

    checkpoint_manager = tf.train.CheckpointManager(
        checkpoint,
        directory=checkpoint_dir,
        max_to_keep=5
    )

    return checkpoint_manager


def save_checkpoint(checkpoint_manager, step: int):
    """Save a checkpoint"""
    checkpoint_manager.save(checkpoint_number=step)


def load_checkpoint(checkpoint_manager):
    """Load the latest checkpoint"""
    status = checkpoint_manager.checkpoint.restore(checkpoint_manager.latest_checkpoint)
    return status
