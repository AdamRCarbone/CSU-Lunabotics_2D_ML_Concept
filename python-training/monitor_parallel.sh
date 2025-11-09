#!/bin/bash
# Monitor and restart PARALLEL training script
# Runs multiple browser environments in parallel for faster training

SCRIPT="training/train_ppo_parallel_auto.py"
PROCESS_NAME="train_ppo_parallel_auto.py"

echo "============================================"
echo "Parallel Training Monitor & Auto-Restart"
echo "============================================"
echo ""

# Ask for training configuration
echo -n "Number of parallel environments? (default: 4, recommended 2-8): "
read NUM_ENVS

# Use default if empty
if [ -z "$NUM_ENVS" ]; then
    NUM_ENVS=4
fi

echo -n "Total training steps? (default: 1000000): "
read TOTAL_STEPS

# Use default if empty
if [ -z "$TOTAL_STEPS" ]; then
    TOTAL_STEPS=1000000
fi

echo -n "Max steps per episode? (default: 1000): "
read MAX_EPISODE_STEPS

# Use default if empty
if [ -z "$MAX_EPISODE_STEPS" ]; then
    MAX_EPISODE_STEPS=1000
fi

echo ""
echo "Configuration:"
echo "  Parallel environments: $NUM_ENVS (~${NUM_ENVS}x speedup)"
echo "  Total training steps: $TOTAL_STEPS"
echo "  Max steps per episode: $MAX_EPISODE_STEPS"
echo ""
echo "This will monitor the parallel training process and restart it if it dies"
echo "These settings will be used for ALL restarts"
echo "Press Ctrl+C to stop"
echo ""

# First time: open browser tabs
echo "NOTE: You'll need to keep the browser tabs open"
echo "The script will open $NUM_ENVS tabs initially"
echo ""

while true; do
    # Check if the training script is running
    if pgrep -f "$PROCESS_NAME" > /dev/null; then
        # Process is running
        sleep 1
    else
        # Process is not running, start it
        echo ""
        echo "$(date): Parallel training not running - starting it..."
        echo ""

        # Start training in background with the specified parameters
        python3 "$SCRIPT" "$NUM_ENVS" "$TOTAL_STEPS" "$MAX_EPISODE_STEPS" &

        # Wait a bit before next check
        sleep 5
    fi
done
