#!/bin/bash
# Thorough cleanup script - kills all training processes and frees ports

echo "============================================"
echo "Cleaning up ALL training processes & ports"
echo "============================================"
echo ""

# Kill all Python training processes
echo "Stopping Python training processes..."
pkill -9 -f "train_ppo_continue.py" 2>/dev/null
pkill -9 -f "train_ppo_parallel_auto.py" 2>/dev/null
pkill -9 -f "train_single_env.py" 2>/dev/null
sleep 1

# Free up all ports (8765-8790)
echo "Freeing ports 8765-8790..."
for port in {8765..8790}; do
    PIDS=$(lsof -ti:$port 2>/dev/null)
    if [ ! -z "$PIDS" ]; then
        echo "  Killing process on port $port (PIDs: $PIDS)"
        echo "$PIDS" | xargs kill -9 2>/dev/null
    fi
done
sleep 1

# Close browser tabs (macOS only)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Closing browser tabs..."
    osascript -e 'tell application "Google Chrome"
        set windowList to every window
        repeat with aWindow in windowList
            set tabList to every tab of aWindow
            repeat with atab in tabList
                if URL of atab contains "localhost:4200" then
                    close atab
                end if
            end repeat
        end repeat
    end tell' 2>/dev/null
fi

echo ""
echo "Cleanup complete!"
echo ""

# Verify cleanup
echo "Verifying ports are free..."
REMAINING=$(lsof -ti:8765-8790 2>/dev/null | wc -l | tr -d ' ')
if [ "$REMAINING" = "0" ]; then
    echo "✓ All ports are free!"
else
    echo "⚠ Warning: $REMAINING processes still using ports"
    echo "Run this script again or manually kill:"
    lsof -ti:8765-8790 2>/dev/null
fi
