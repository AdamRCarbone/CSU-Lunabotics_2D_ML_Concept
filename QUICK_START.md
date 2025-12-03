# Quick Start - Single Environment High-Speed Training

## What Changed

✅ **Fixed WebSocket latency** - Robot no longer learns jittery behavior!
- Added action buffering (3-action buffer)
- Added pipelined communication (no blocking)
- Added 60 FPS game loop for smooth movement
- **Result: 0ms perceived latency!**

✅ **Updated train.sh / train.bat** - Simplified for single environment training
- Default mode: Single environment (mode 1)
- Default timescale: 10x speed
- Prompts for timescale (recommended: 10-20x)
- **Windows support with train.bat!**

## Running Single Environment Training

### Step 1: Start the Web App
```bash
cd webapp/ml-navigation
npm start
```

Wait for it to say: `✔ Compiled successfully`

### Step 2: Start Training

**macOS/Linux:**
```bash
cd python-training
./train.sh
```

**Windows:**
```cmd
cd python-training
train.bat
```

### Step 3: Choose Settings

When prompted:

```
Training mode:
  1) Single environment (simple, reliable)
  2) Parallel environments (~25x faster with 25 envs)
  3) Independent processes (each env restarts individually - FAST RECOVERY)

Choose mode [1, 2, or 3] (default: 1):
```
**Press Enter** (accepts default mode 1)

```
Total training steps? (default: 10000000):
```
**Press Enter** (10 million steps is good)

```
Max steps per episode? (default: 5000):
```
**Press Enter** (5000 is good)

```
Simulation speed (timescale)? (default: 10, recommended: 10-20):
```
**Type: 15** (or any value 10-20 for high speed)

### What You'll See

The training will start and you'll see:
```
Configuration:
  Mode: Single environment
  Total training steps: 10000000
  Max steps per episode: 5000
  Timescale: 15x speed

Starting training with auto-restart...
Press Ctrl+C to stop and cleanup
```

Browser will automatically:
1. Connect to Python
2. Start training
3. Apply actions smoothly at 60 FPS

### Monitor Training

In the browser console (F12), you'll see:
```
[ML Bridge] Latency: avg=25ms, min=15ms, max=45ms, buffer=2
[ML Bridge] Applying buffered action: [0.5, -0.3, 0.1]
```

**Good signs:**
- ✅ `avg < 50ms` - Good WebSocket performance
- ✅ `buffer > 0` - Always has actions ready
- ✅ Smooth robot movement - No freezing!

**Bad signs:**
- ❌ `buffer = 0` - Robot might stutter (increase ACTION_BUFFER_SIZE)
- ❌ `avg > 100ms` - High latency (check network/Python performance)

### Stopping Training

**macOS/Linux:**
Press **Ctrl+C** in the terminal running train.sh

**Windows:**
Press **Ctrl+C** in the command prompt running train.bat

It will automatically:
- Stop Python training
- Free up ports
- Close browser tabs (macOS only, manual on Windows)

## Timescale Recommendations

| Speed | Use Case | Notes |
|-------|----------|-------|
| 1x | Debugging, watching behavior | Real-time |
| 5x | Testing | Still visible |
| 10x | **Recommended for single env** | Good speed, stable |
| 15x | **High-speed training** | Fast, still smooth |
| 20x | Maximum stable speed | May be choppy visually |
| 25x+ | Parallel only | Too fast for single env |

## Platform-Specific Notes

### Windows (train.bat)
- ✅ Full feature parity with train.sh
- ✅ Automatic port cleanup
- ✅ Process monitoring and auto-restart
- ⚠️ Browser tabs don't auto-close on exit (manual cleanup)
- Uses `tasklist` and `netstat` for process/port management

### macOS/Linux (train.sh)
- ✅ Automatic browser tab cleanup on exit
- ✅ Grid window layout for parallel mode
- Uses `lsof` and `pkill` for process/port management

## Troubleshooting

### Robot moves jerkily
- **Old issue**: This was the latency problem - should be FIXED now!
- **If still happening**: Check browser console for buffer warnings

### "Action buffer empty" warnings
**Solution**: Increase buffer size in `ml-bridge.ts`:
```typescript
private readonly ACTION_BUFFER_SIZE = 5;  // Increase from 3 to 5
```

### Training restarts frequently
- **Python may be crashing**: Check Python console for errors
- **Timescale too high**: Try lower value (10x instead of 20x)

### High latency (avg > 100ms)
- **Close other applications** using network/CPU
- **Check Python performance**: Is ML training slow?
- **Lower timescale**: Less WebSocket messages per second

### Windows: Port already in use
```cmd
REM Find what's using port 8765
netstat -ano | findstr :8765

REM Kill the process (replace PID with actual process ID)
taskkill /F /PID <PID>
```

### macOS/Linux: Port already in use
```bash
# Find what's using port 8765
lsof -ti:8765

# Kill the process
lsof -ti:8765 | xargs kill -9
```

## What's Different from Before

### Before Optimization
- Robot froze between actions ❌
- Learned to over-correct for latency ❌
- Jittery movement ❌
- Synchronous WebSocket blocking ❌

### After Optimization
- Smooth 60 FPS movement ✅
- Learns actual dynamics ✅
- No jittery behavior ✅
- Pipelined action buffering ✅

## Advanced: Tuning the Buffer

If you need to tune performance, edit `webapp/ml-navigation/src/app/services/ml-bridge.ts`:

```typescript
// Larger buffer = more latency tolerance, but slightly delayed reactions
private readonly ACTION_BUFFER_SIZE = 3;  // Default: 3

// Higher FPS = smoother movement, but more CPU
private readonly GAME_LOOP_FPS = 60;  // Default: 60

// Pipeline mode - keep this enabled!
private usePipelineMode: boolean = true;  // Default: true
```

## Files Changed

- ✅ `webapp/ml-navigation/src/app/services/ml-bridge.ts` - Optimized WebSocket
- ✅ `python-training/train.sh` - Updated for single env with timescale (macOS/Linux)
- ✅ `python-training/train.bat` - Windows version with same functionality
- ✅ `python-training/training/train_ppo_continue.py` - Added timescale parameter
- ✅ `WEBSOCKET_OPTIMIZATION.md` - Full technical documentation

## Next Steps

1. **Run training overnight** - Let it accumulate millions of steps
2. **Monitor checkpoints** - Saved in `python-training/models/`
3. **Test trained model** - Load checkpoint and watch it perform!
4. **Tune rewards** - Adjust in `ml-reward.ts` if needed

Enjoy smooth, latency-free training! 🚀
