#!/bin/bash
# Master training script - handles everything automatically
# Just run this and let it train overnight!

# ============================================
# DEFAULT CONFIGURATION
# ============================================
DEFAULT_MODE=3                      # 1=Single, 2=Parallel
DEFAULT_NUM_ENVS=25                 # Number of parallel environments
DEFAULT_TOTAL_STEPS=10000000        # Total training steps (10 million)
DEFAULT_MAX_EPISODE_STEPS=5000      # Max steps per episode
DEFAULT_TIMESCALE=25                # Simulation speed multiplier

# ============================================

# Cleanup function - called on exit (Ctrl+C)
cleanup() {
    echo ""
    echo "============================================"
    echo "Cleaning up..."
    echo "============================================"

    # Kill Python training processes
    echo "Stopping training processes..."
    pkill -f "train_ppo_continue.py" 2>/dev/null
    pkill -f "train_ppo_parallel_auto.py" 2>/dev/null
    pkill -f "train_single_env.py" 2>/dev/null

    # Free up ports
    echo "Freeing up ports..."
    for port in {8765..8790}; do
        lsof -ti:$port | xargs kill -9 2>/dev/null
    done

    # Close browser tabs/windows (macOS only)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "Closing browser tabs/windows..."
        osascript -e 'tell application "Google Chrome"
            set windowList to every window
            repeat with aWindow in windowList
                set tabList to every tab of aWindow
                repeat with atab in tabList
                    if URL of atab contains "localhost:4200" then
                        -- If this is the only tab in the window, close the whole window
                        if (count of tabList) is 1 then
                            close aWindow
                        else
                            close atab
                        end if
                    end if
                end repeat
            end repeat
        end tell' 2>/dev/null
    fi

    echo "Cleanup complete!"
    exit 0
}

# Trap Ctrl+C (SIGINT) and call cleanup
trap cleanup SIGINT SIGTERM

echo "============================================"
echo "   Lunar Rover ML Training - Master Script"
echo "============================================"
echo ""

# Check if web app is running
if ! lsof -ti:4200 > /dev/null 2>&1; then
    echo "❌ ERROR: Web app is not running on port 4200"
    echo ""
    echo "Please start the web app first:"
    echo "  cd webapp/ml-navigation"
    echo "  npm start"
    echo ""
    exit 1
fi

echo "✓ Web app detected on port 4200"
echo ""

# Ask user: single or parallel?
echo "Training mode:"
echo "  1) Single environment (simple, reliable)"
echo "  2) Parallel environments (~${DEFAULT_NUM_ENVS}x faster with ${DEFAULT_NUM_ENVS} envs)"
echo "  3) Independent processes (each env restarts individually - FAST RECOVERY)"
echo ""
echo -n "Choose mode [1, 2, or 3] (default: $DEFAULT_MODE): "
read MODE

if [ -z "$MODE" ]; then
    MODE=$DEFAULT_MODE
fi

echo ""

# ============================================
# SINGLE ENVIRONMENT MODE
# ============================================
if [ "$MODE" = "1" ]; then
    echo "============================================"
    echo "Single Environment Training"
    echo "============================================"
    echo ""

    SCRIPT="training/train_ppo_continue.py"
    PROCESS_NAME="train_ppo_continue.py"

    echo -n "Total training steps? (default: $DEFAULT_TOTAL_STEPS): "
    read TOTAL_STEPS
    if [ -z "$TOTAL_STEPS" ]; then
        TOTAL_STEPS=$DEFAULT_TOTAL_STEPS
    fi

    echo -n "Max steps per episode? (default: $DEFAULT_MAX_EPISODE_STEPS): "
    read MAX_EPISODE_STEPS
    if [ -z "$MAX_EPISODE_STEPS" ]; then
        MAX_EPISODE_STEPS=$DEFAULT_MAX_EPISODE_STEPS
    fi

    echo ""
    echo "Configuration:"
    echo "  Mode: Single environment"
    echo "  Total training steps: $TOTAL_STEPS"
    echo "  Max steps per episode: $MAX_EPISODE_STEPS"
    echo ""
    echo "Starting training with auto-restart..."
    echo "Press Ctrl+C to stop and cleanup"
    echo ""

    # Cleanup any existing processes
    echo "Cleaning up old processes..."
    pkill -f "$PROCESS_NAME" 2>/dev/null
    for port in {8765..8790}; do
        lsof -ti:$port | xargs kill -9 2>/dev/null
    done
    sleep 1

    # Monitor loop
    while true; do
        if pgrep -f "$PROCESS_NAME" > /dev/null; then
            sleep 1
        else
            echo ""
            echo "$(date): Training not running - starting it..."
            echo ""
            python3 "$SCRIPT" "$TOTAL_STEPS" "$MAX_EPISODE_STEPS" &
            sleep 5
        fi
    done

# ============================================
# PARALLEL ENVIRONMENT MODE
# ============================================
elif [ "$MODE" = "2" ]; then
    echo "============================================"
    echo "Parallel Environment Training"
    echo "============================================"
    echo ""

    SCRIPT="training/train_ppo_parallel_auto.py"
    PROCESS_NAME="train_ppo_parallel_auto.py"

    echo -n "Number of parallel environments? (default: $DEFAULT_NUM_ENVS): "
    read NUM_ENVS
    if [ -z "$NUM_ENVS" ]; then
        NUM_ENVS=$DEFAULT_NUM_ENVS
    fi

    echo -n "Total training steps? (default: $DEFAULT_TOTAL_STEPS): "
    read TOTAL_STEPS
    if [ -z "$TOTAL_STEPS" ]; then
        TOTAL_STEPS=$DEFAULT_TOTAL_STEPS
    fi

    echo -n "Max steps per episode? (default: $DEFAULT_MAX_EPISODE_STEPS): "
    read MAX_EPISODE_STEPS
    if [ -z "$MAX_EPISODE_STEPS" ]; then
        MAX_EPISODE_STEPS=$DEFAULT_MAX_EPISODE_STEPS
    fi

    echo ""
    echo "Configuration:"
    echo "  Mode: Parallel ($NUM_ENVS environments)"
    echo "  Speedup: ~${NUM_ENVS}x faster"
    echo "  Total training steps: $TOTAL_STEPS"
    echo "  Max steps per episode: $MAX_EPISODE_STEPS"
    echo ""
    echo "Starting parallel training with auto-restart..."
    echo "This will open $NUM_ENVS browser tabs"
    echo "Press Ctrl+C to stop and cleanup"
    echo ""

    # Cleanup any existing processes
    echo "Cleaning up old processes..."
    pkill -f "$PROCESS_NAME" 2>/dev/null
    for port in {8765..8790}; do
        lsof -ti:$port | xargs kill -9 2>/dev/null
    done
    sleep 1

    # Monitor loop
    while true; do
        if pgrep -f "$PROCESS_NAME" > /dev/null; then
            sleep 1
        else
            echo ""
            echo "$(date): Parallel training not running - starting it..."
            echo ""
            python3 "$SCRIPT" "$NUM_ENVS" "$TOTAL_STEPS" "$MAX_EPISODE_STEPS" &
            sleep 5
        fi
    done

# ============================================
# INDEPENDENT PROCESSES MODE
# ============================================
elif [ "$MODE" = "3" ]; then
    echo "============================================"
    echo "Independent Process Training"
    echo "============================================"
    echo ""

    SCRIPT="training/train_single_env.py"

    echo -n "Number of parallel environments? (default: $DEFAULT_NUM_ENVS): "
    read NUM_ENVS
    if [ -z "$NUM_ENVS" ]; then
        NUM_ENVS=$DEFAULT_NUM_ENVS
    fi

    echo -n "Total training steps per environment? (default: $DEFAULT_TOTAL_STEPS): "
    read TOTAL_STEPS
    if [ -z "$TOTAL_STEPS" ]; then
        TOTAL_STEPS=$DEFAULT_TOTAL_STEPS
    fi

    echo -n "Max steps per episode? (default: $DEFAULT_MAX_EPISODE_STEPS): "
    read MAX_EPISODE_STEPS
    if [ -z "$MAX_EPISODE_STEPS" ]; then
        MAX_EPISODE_STEPS=$DEFAULT_MAX_EPISODE_STEPS
    fi

    echo ""
    echo "Browser display mode:"
    echo "  1) Tabs (all in one window)"
    echo "  2) Windows (grid layout - RECOMMENDED for monitoring)"
    echo ""
    echo -n "Choose display mode [1 or 2] (default: 2): "
    read BROWSER_MODE
    if [ -z "$BROWSER_MODE" ]; then
        BROWSER_MODE=2
    fi

    # Scale factor for window size (1.0 = exact fit, >1.0 = larger windows)
    SCALE_FACTOR=1.2

    echo ""
    echo "Configuration:"
    echo "  Mode: Independent processes ($NUM_ENVS environments)"
    echo "  Each environment runs in isolated process"
    echo "  Individual auto-restart on failure (FAST RECOVERY)"
    echo "  Total training steps per env: $TOTAL_STEPS"
    echo "  Max steps per episode: $MAX_EPISODE_STEPS"
    echo ""
    echo "Starting independent training processes..."
    echo "This will open $NUM_ENVS browser tabs"
    echo "Each process will restart independently"
    echo "Press Ctrl+C to stop all and cleanup"
    echo ""

    # Thorough cleanup of existing processes and ports
    echo "Cleaning up old processes and ports..."
    echo "This ensures all ports are free before starting"
    echo ""

    # Kill ALL training scripts
    pkill -9 -f "train_single_env.py" 2>/dev/null
    pkill -9 -f "train_ppo_parallel_auto.py" 2>/dev/null
    pkill -9 -f "train_ppo_continue.py" 2>/dev/null

    # Wait for processes to die
    sleep 1

    # Free up each port individually with verification
    PORTS_CLEANED=0
    for port in {8765..8790}; do
        PIDS=$(lsof -ti:$port 2>/dev/null)
        if [ ! -z "$PIDS" ]; then
            echo "  Freeing port $port..."
            echo "$PIDS" | xargs kill -9 2>/dev/null
            PORTS_CLEANED=$((PORTS_CLEANED + 1))
        fi
    done

    if [ $PORTS_CLEANED -gt 0 ]; then
        echo "  Freed $PORTS_CLEANED ports"
    else
        echo "  All ports already free"
    fi

    # Extra wait for ports to fully release
    sleep 2

    echo "✓ Cleanup complete!"
    echo ""

    # Launch Python processes FIRST - this ensures websockets are listening before browsers connect
    echo "Launching $NUM_ENVS independent training processes..."
    echo "Each process has its own persistent websocket and auto-restart loop"
    echo ""

    PIDS=()
    # Create logs directory for process outputs
    mkdir -p ./logs/process_logs

    for i in $(seq 0 $((NUM_ENVS - 1))); do
        PORT=$((8765 + i))
        LOG_FILE="./logs/process_logs/env_${i}.log"

        # Use -u for unbuffered output, redirect to log file, use nohup for reliability
        nohup python3 -u "$SCRIPT" "$i" "$PORT" "$TOTAL_STEPS" "$MAX_EPISODE_STEPS" "$DEFAULT_TIMESCALE" > "$LOG_FILE" 2>&1 &
        PID=$!
        PIDS+=($PID)

        # Give process time to start
        sleep 0.4

        # Verify process actually started
        if ! ps -p $PID > /dev/null 2>&1; then
            echo "⚠️  WARNING: Process for env $i (PID $PID) failed to start! Check $LOG_FILE"
        fi
    done

    echo ""
    echo "  ✓ Launched $NUM_ENVS processes"
    echo ""
    echo "Waiting 8 seconds for websocket servers to start..."
    sleep 8  # Give Python processes time to bind websocket ports and initialize
    echo ""

    # Verify processes started successfully and ports are listening
    RUNNING_COUNT=$(pgrep -f "train_single_env.py" | wc -l | tr -d ' ')
    echo "Process check: $RUNNING_COUNT/$NUM_ENVS processes running"

    # Check which ports are actually listening
    echo "Checking websocket ports..."
    FAILED_ENVS=()
    for i in $(seq 0 $((NUM_ENVS - 1))); do
        PORT=$((8765 + i))
        if ! lsof -ti:$PORT > /dev/null 2>&1; then
            FAILED_ENVS+=($i)
        fi
    done

    if [ ${#FAILED_ENVS[@]} -gt 0 ]; then
        echo ""
        echo "⚠️  WARNING: ${#FAILED_ENVS[@]} environments failed to start:"
        for env_id in "${FAILED_ENVS[@]}"; do
            port=$((8765 + env_id))
            echo "  - Env $env_id (port $port)"
        done
        echo ""
        echo "Working environments: $((NUM_ENVS - ${#FAILED_ENVS[@]}))/$NUM_ENVS"
    else
        echo "✓ All $NUM_ENVS websocket servers are listening!"
    fi
    echo ""

    # NOW open browser windows/tabs - websockets are ready to accept connections
    if [ "$BROWSER_MODE" = "2" ]; then
        echo "Opening $NUM_ENVS browser windows in grid layout..."

        # Get screen dimensions (macOS)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # Parse resolution - handle "3024 x 1964 Retina" format
            RESOLUTION=$(system_profiler SPDisplaysDataType | grep Resolution | head -1)
            SCREEN_WIDTH=$(echo "$RESOLUTION" | awk '{print $2}')
            SCREEN_HEIGHT=$(echo "$RESOLUTION" | awk '{print $4}')

            # Verify we got valid numbers
            if ! [[ "$SCREEN_WIDTH" =~ ^[0-9]+$ ]] || ! [[ "$SCREEN_HEIGHT" =~ ^[0-9]+$ ]]; then
                echo "  Warning: Could not detect screen resolution, using defaults"
                SCREEN_WIDTH=1920
                SCREEN_HEIGHT=1080
            fi
        else
            # Default for other systems
            SCREEN_WIDTH=1920
            SCREEN_HEIGHT=1080
        fi

        # Reserve space for macOS menu bar and dock
        USABLE_WIDTH=$SCREEN_WIDTH
        USABLE_HEIGHT=$((SCREEN_HEIGHT - 150))  # Menu bar (25px) + dock space (125px)
        START_X=0
        START_Y=25  # Just below menu bar

        # Calculate grid dimensions (try to make it roughly square)
        COLS=$(echo "sqrt($NUM_ENVS)" | bc)
        ROWS=$(( (NUM_ENVS + COLS - 1) / COLS ))  # Ceiling division

        # Calculate window dimensions based on grid
        # Each window should fit in the grid with 16:9 aspect ratio
        MAX_WINDOW_WIDTH=$((USABLE_WIDTH / COLS))
        MAX_WINDOW_HEIGHT=$((USABLE_HEIGHT / ROWS))

        # Maintain 16:9 aspect ratio - use the limiting dimension
        # 16:9 means width = height * (16/9) ≈ height * 1.778
        # Using integer math: width = height * 16 / 9
        WIDTH_IF_HEIGHT_LIMITED=$((MAX_WINDOW_HEIGHT * 16 / 9))
        HEIGHT_IF_WIDTH_LIMITED=$((MAX_WINDOW_WIDTH * 9 / 16))

        if [ $WIDTH_IF_HEIGHT_LIMITED -le $MAX_WINDOW_WIDTH ]; then
            # Height is the limiting factor (tall narrow grid cells)
            WINDOW_HEIGHT=$MAX_WINDOW_HEIGHT
            WINDOW_WIDTH=$WIDTH_IF_HEIGHT_LIMITED
        else
            # Width is the limiting factor (wide short grid cells)
            WINDOW_WIDTH=$MAX_WINDOW_WIDTH
            WINDOW_HEIGHT=$HEIGHT_IF_WIDTH_LIMITED
        fi

        # Check for Retina display and adjust for 2x scaling
        # On Retina, the logical pixels are 2x the actual window size
        IS_RETINA=false
        if echo "$RESOLUTION" | grep -qi "Retina"; then
            echo "  Detected Retina display - adjusting for 2x scaling"
            WINDOW_WIDTH=$((WINDOW_WIDTH / 2))
            WINDOW_HEIGHT=$((WINDOW_HEIGHT / 2))
            IS_RETINA=true
        fi

        # Apply scale factor to make windows larger (uses bc for float math)
        WINDOW_WIDTH=$(echo "$WINDOW_WIDTH * $SCALE_FACTOR" | bc | cut -d'.' -f1)
        WINDOW_HEIGHT=$(echo "$WINDOW_HEIGHT * $SCALE_FACTOR" | bc | cut -d'.' -f1)

        echo "  Screen resolution: ${SCREEN_WIDTH}x${SCREEN_HEIGHT}"
        echo "  Usable area: ${USABLE_WIDTH}x${USABLE_HEIGHT}"
        echo "  Grid layout: ${ROWS} rows × ${COLS} cols"
        echo "  Max cell size: ${MAX_WINDOW_WIDTH}x${MAX_WINDOW_HEIGHT}"
        if [ "$IS_RETINA" = true ]; then
            echo "  Window size: ${WINDOW_WIDTH}x${WINDOW_HEIGHT} (16:9, Retina adjusted, ${SCALE_FACTOR}x scale)"
        else
            echo "  Window size: ${WINDOW_WIDTH}x${WINDOW_HEIGHT} (16:9, ${SCALE_FACTOR}x scale)"
        fi
        echo ""

        for i in $(seq 0 $((NUM_ENVS - 1))); do
            PORT=$((8765 + i))
            URL="http://localhost:4200?wsPort=$PORT&maxSteps=$MAX_EPISODE_STEPS"

            # Calculate position in grid
            ROW=$((i / COLS))
            COL=$((i % COLS))
            X=$((START_X + COL * WINDOW_WIDTH))
            Y=$((START_Y + ROW * WINDOW_HEIGHT))

            # macOS: use osascript to create positioned window
            if [[ "$OSTYPE" == "darwin"* ]]; then
                osascript <<EOF 2>/dev/null
                tell application "Google Chrome"
                    set newWindow to make new window
                    set URL of active tab of newWindow to "$URL"
                    delay 0.1
                    set bounds of newWindow to {$X, $Y, $((X + WINDOW_WIDTH)), $((Y + WINDOW_HEIGHT))}
                end tell
EOF
            # Linux: try xdg-open with window positioning (varies by window manager)
            elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
                google-chrome --new-window --window-size=$WINDOW_WIDTH,$WINDOW_HEIGHT --window-position=$X,$Y "$URL" 2>/dev/null &
            # Windows: use start with positioning
            else
                start chrome --new-window --window-size=$WINDOW_WIDTH,$WINDOW_HEIGHT --window-position=$X,$Y "$URL" 2>/dev/null
            fi

            sleep 0.2  # Slight delay for window creation and positioning
        done

        echo "  ✓ Opened $NUM_ENVS windows in ${ROWS}x${COLS} grid"
    else
        # Tab mode (original behavior)
        echo "Opening $NUM_ENVS browser tabs..."
        for i in $(seq 0 $((NUM_ENVS - 1))); do
            PORT=$((8765 + i))
            URL="http://localhost:4200?wsPort=$PORT&maxSteps=$MAX_EPISODE_STEPS"

            # macOS: use osascript to open in new tab
            if [[ "$OSTYPE" == "darwin"* ]]; then
                osascript -e "tell application \"Google Chrome\" to open location \"$URL\"" 2>/dev/null
            # Linux: try xdg-open
            elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
                xdg-open "$URL" 2>/dev/null
            # Windows: use start
            else
                start "$URL" 2>/dev/null
            fi

            sleep 0.1  # Small delay to avoid overwhelming Chrome
        done

        echo "  ✓ Opened $NUM_ENVS tabs"
    fi

    echo ""
    echo "================================================"
    echo "All $NUM_ENVS training processes running!"
    echo "================================================"
    echo ""
    echo "How it works:"
    echo "  - Browser tabs stay open"
    echo "  - Websocket servers stay alive"
    echo "  - Only ML training loop restarts on timeout"
    echo "  - Fast recovery (< 1 second)"
    echo ""
    echo "Press Ctrl+C to stop everything and close tabs"
    echo ""

    # Wait for all background processes (or Ctrl+C)
    wait

else
    echo "Invalid mode selected. Please choose 1, 2, or 3."
    exit 1
fi
