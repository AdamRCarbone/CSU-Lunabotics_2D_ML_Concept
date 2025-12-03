# Windows Training Guide

## Quick Start (Windows)

### 1. Start Web App
Open **PowerShell** or **Command Prompt**:
```cmd
cd webapp\ml-navigation
npm start
```

Wait for: `✔ Compiled successfully`

### 2. Start Training
Open a **new** PowerShell/Command Prompt window:
```cmd
cd python-training
train.bat
```

### 3. Follow Prompts
- **Mode**: Press Enter (default: 1 - Single environment)
- **Steps**: Press Enter (default: 10,000,000)
- **Episode steps**: Press Enter (default: 5,000)
- **Timescale**: Type `15` and press Enter (high speed)

### 4. Training Starts!
You'll see:
```
Configuration:
  Mode: Single environment
  Total training steps: 10000000
  Max steps per episode: 5000
  Timescale: 15x speed

Starting training with auto-restart...
```

Browser will open automatically and start training!

## Windows Batch File Features

### What `train.bat` Does

✅ **Process Management**
- Uses `tasklist` to monitor Python processes
- Auto-restart on crash
- Checks if web app is running before starting

✅ **Port Cleanup**
- Uses `netstat` to find processes using ports 8765-8790
- Kills processes with `taskkill /F /PID`
- Ensures clean start every time

✅ **Browser Integration**
- Opens Chrome tabs/windows automatically
- Passes WebSocket port via URL parameters
- Works with default browser

### Differences from Linux/macOS Version

| Feature | Windows (train.bat) | Linux/macOS (train.sh) |
|---------|---------------------|------------------------|
| Process monitoring | ✅ `tasklist` | ✅ `pgrep` |
| Port cleanup | ✅ `netstat` + `taskkill` | ✅ `lsof` + `kill` |
| Auto-restart | ✅ Yes | ✅ Yes |
| Browser auto-close | ❌ Manual | ✅ Automatic (macOS) |
| Grid window layout | ❌ Not available | ✅ Yes (mode 3) |
| All 3 modes | ✅ Yes | ✅ Yes |

## Stopping Training (Windows)

### Method 1: Ctrl+C (Recommended)
Press **Ctrl+C** in the Command Prompt window running `train.bat`

This will:
- Stop the training script
- ⚠️ You'll need to manually close browser tabs

### Method 2: Manual Cleanup
If Ctrl+C doesn't work:

1. **Close browser tabs** manually

2. **Kill Python processes**:
   ```cmd
   taskkill /F /IM python.exe
   ```

3. **Free ports** (if needed):
   ```cmd
   REM Find processes using port 8765
   netstat -ano | findstr :8765

   REM Kill the process (replace 1234 with actual PID)
   taskkill /F /PID 1234
   ```

## Troubleshooting Windows-Specific Issues

### Error: "Web app is not running on port 4200"

**Solution**: Start the web app first
```cmd
cd webapp\ml-navigation
npm start
```

Wait until you see: `✔ Compiled successfully`

### Error: Port already in use

**Find what's using the port**:
```cmd
netstat -ano | findstr :8765
```

Output example:
```
TCP    0.0.0.0:8765    0.0.0.0:0    LISTENING    1234
```

**Kill the process** (replace 1234 with actual PID):
```cmd
taskkill /F /PID 1234
```

**Or kill all Python processes**:
```cmd
taskkill /F /IM python.exe
```

### Python process won't die

**Force kill all Python**:
```cmd
taskkill /F /IM python.exe
```

**Or use Task Manager**:
1. Press `Ctrl+Shift+Esc`
2. Find "Python" processes
3. Right-click → "End task"

### Browser doesn't open automatically

**Manual open**:
1. Open Chrome
2. Navigate to: `http://localhost:4200`
3. Click "Connect to Python" and "Start Training"

**With WebSocket port** (for parallel mode):
```
http://localhost:4200?wsPort=8765&maxSteps=5000
```

### "Access Denied" when killing processes

**Run as Administrator**:
1. Right-click Command Prompt
2. Select "Run as administrator"
3. Run `train.bat` again

## Windows Performance Tips

### 1. Disable Windows Defender Real-Time Scanning (Temporary)
WebSocket communication can be slowed by antivirus:

1. Open Windows Security
2. Virus & threat protection
3. Manage settings
4. Turn off "Real-time protection" (temporarily)
5. **Remember to turn it back on after training!**

### 2. Set Python Priority (Optional)

In Task Manager:
1. Find Python process
2. Right-click → "Go to details"
3. Right-click python.exe → "Set priority" → "High"

### 3. Close Unnecessary Applications

To maximize performance:
- Close browsers except training tab
- Close Discord, Slack, etc.
- Close file explorers
- Close background apps

### 4. Power Plan

Set to "High Performance":
1. Control Panel → Power Options
2. Select "High performance"
3. This prevents CPU throttling

## Batch File Customization

Edit `train.bat` to change defaults:

```batch
REM At the top of train.bat:
set DEFAULT_MODE=1              REM 1=Single, 2=Parallel, 3=Independent
set DEFAULT_NUM_ENVS=25         REM For parallel modes
set DEFAULT_TOTAL_STEPS=10000000
set DEFAULT_MAX_EPISODE_STEPS=5000
set DEFAULT_TIMESCALE=10        REM Simulation speed
```

## File Locations (Windows)

### Logs
```
python-training\logs\
  └─ process_logs\
      └─ env_0.log       (for independent mode)
```

### Models (Checkpoints)
```
python-training\models\
  └─ lunar_rover_ppo_850000_steps.zip
  └─ lunar_rover_ppo_1000000_steps.zip
```

### Configuration
```
webapp\ml-navigation\src\app\services\ml-bridge.ts  (buffer settings)
webapp\ml-navigation\src\app\services\ml-reward.ts  (reward tuning)
```

## Example Training Session (Windows)

```cmd
C:\Users\adam.carbone\...\CSU-Lunabotics_2D_ML_Concept-2>cd python-training

C:\Users\adam.carbone\...\python-training>train.bat

============================================
   Lunar Rover ML Training - Master Script
============================================

Web app detected on port 4200

Training mode:
  1) Single environment (simple, reliable)
  2) Parallel environments (~25x faster with 25 envs)
  3) Independent processes (each env restarts individually - FAST RECOVERY)

Choose mode [1, 2, or 3] (default: 1): [Press Enter]

============================================
Single Environment Training
============================================

Total training steps? (default: 10000000): [Press Enter]
Max steps per episode? (default: 5000): [Press Enter]
Simulation speed (timescale)? (default: 10, recommended: 10-20): 15

Configuration:
  Mode: Single environment
  Total training steps: 10000000
  Max steps per episode: 5000
  Timescale: 15x speed

Starting training with auto-restart...
Press Ctrl+C to stop

[Browser opens automatically and training starts!]
```

## Support

If you encounter Windows-specific issues:

1. Check `python-training\logs\` for error messages
2. Verify Python is installed and in PATH
3. Ensure npm and Node.js are installed
4. Check Windows Firewall isn't blocking ports 4200, 8765

Enjoy smooth training on Windows! 🚀
