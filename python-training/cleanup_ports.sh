#!/bin/bash
# Cleanup script - kills training processes and frees ports

echo "Cleaning up training processes and ports..."

# Kill any running training processes
pkill -f "train_ppo" 2>/dev/null

# Free up ports 8765-8790 (enough for 25 environments, though you shouldn't use that many!)
for port in {8765..8790}; do
    lsof -ti:$port | xargs kill -9 2>/dev/null
done

echo "Cleanup complete! Ports 8765-8790 are now free."
echo ""
echo "You can now start training with ./monitor_and_restart.sh"
