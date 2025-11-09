#!/bin/bash
# Monitor and restart training script
# Checks every second if training is running, starts it if not

SCRIPT="training/train_ppo_continue.py"
PROCESS_NAME="train_ppo_continue.py"

echo "============================================"
echo "Training Monitor & Auto-Restart"
echo "============================================"
echo ""

# Ask for training configuration
echo -n "Total training steps? (default: 1000000): "
read ADDITIONAL_STEPS

# Use default if empty
if [ -z "$ADDITIONAL_STEPS" ]; then
    ADDITIONAL_STEPS=1000000
fi

echo -n "Max steps per episode? (default: 1000): "
read MAX_EPISODE_STEPS

# Use default if empty
if [ -z "$MAX_EPISODE_STEPS" ]; then
    MAX_EPISODE_STEPS=1000
fi

echo ""
echo "Configuration:"
echo "  Total training steps: $ADDITIONAL_STEPS"
echo "  Max steps per episode: $MAX_EPISODE_STEPS"
echo ""
echo "This will monitor the training process and restart it if it dies"
echo "These settings will be used for ALL restarts"
echo "Press Ctrl+C to stop"
echo ""

while true; do
    # Check if the training script is running
    if pgrep -f "$PROCESS_NAME" > /dev/null; then
        # Process is running
        sleep 1
    else
        # Process is not running, start it
        echo ""
        echo "$(date): Training not running - starting it..."
        echo ""

        # Start training in background with the specified parameters
        python3 "$SCRIPT" "$ADDITIONAL_STEPS" "$MAX_EPISODE_STEPS" &

        # Wait a bit before next check
        sleep 5
    fi
done
