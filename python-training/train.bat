@echo off
REM Master training script for Windows - handles everything automatically
REM Just run this and let it train overnight!

setlocal enabledelayedexpansion

REM ============================================
REM DEFAULT CONFIGURATION
REM ============================================
set DEFAULT_MODE=1
set DEFAULT_NUM_ENVS=25
set DEFAULT_TOTAL_STEPS=10000000
set DEFAULT_MAX_EPISODE_STEPS=5000
set DEFAULT_TIMESCALE=10

REM ============================================

echo ============================================
echo    Lunar Rover ML Training - Master Script
echo ============================================
echo.

REM Check if web app is running on port 4200
netstat -ano | findstr ":4200" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Web app is not running on port 4200
    echo.
    echo Please start the web app first:
    echo   cd webapp\ml-navigation
    echo   npm start
    echo.
    pause
    exit /b 1
)

echo Web app detected on port 4200
echo.

REM Ask user: single or parallel?
echo Training mode:
echo   1^) Single environment ^(simple, reliable^)
echo   2^) Parallel environments ^(~%DEFAULT_NUM_ENVS%x faster with %DEFAULT_NUM_ENVS% envs^)
echo   3^) Independent processes ^(each env restarts individually - FAST RECOVERY^)
echo.
set /p MODE="Choose mode [1, 2, or 3] (default: %DEFAULT_MODE%): "
if "%MODE%"=="" set MODE=%DEFAULT_MODE%

echo.

REM ============================================
REM SINGLE ENVIRONMENT MODE
REM ============================================
if "%MODE%"=="1" (
    echo ============================================
    echo Single Environment Training
    echo ============================================
    echo.

    set SCRIPT=training\train_ppo_continue.py
    set PROCESS_NAME=train_ppo_continue.py

    set /p TOTAL_STEPS="Total training steps? (default: %DEFAULT_TOTAL_STEPS%): "
    if "%TOTAL_STEPS%"=="" set TOTAL_STEPS=%DEFAULT_TOTAL_STEPS%

    set /p MAX_EPISODE_STEPS="Max steps per episode? (default: %DEFAULT_MAX_EPISODE_STEPS%): "
    if "%MAX_EPISODE_STEPS%"=="" set MAX_EPISODE_STEPS=%DEFAULT_MAX_EPISODE_STEPS%

    set /p TIMESCALE="Simulation speed (timescale)? (default: %DEFAULT_TIMESCALE%, recommended: 10-20): "
    if "%TIMESCALE%"=="" set TIMESCALE=%DEFAULT_TIMESCALE%

    echo.
    echo Configuration:
    echo   Mode: Single environment
    echo   Total training steps: !TOTAL_STEPS!
    echo   Max steps per episode: !MAX_EPISODE_STEPS!
    echo   Timescale: !TIMESCALE!x speed
    echo.
    echo Starting training with auto-restart...
    echo Press Ctrl+C to stop
    echo.

    REM Cleanup any existing processes
    echo Cleaning up old processes...
    taskkill /F /IM python.exe /FI "WINDOWTITLE eq *train_ppo_continue.py*" >nul 2>&1

    REM Free up ports (Windows version)
    for /L %%p in (8765,1,8790) do (
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p" ^| findstr "LISTENING"') do (
            taskkill /F /PID %%a >nul 2>&1
        )
    )
    timeout /t 1 /nobreak >nul

    REM Monitor loop
    :SINGLE_LOOP
    tasklist /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq *!PROCESS_NAME!*" 2>nul | find /I "python.exe" >nul
    if errorlevel 1 (
        echo.
        echo %date% %time%: Training not running - starting it...
        echo.
        start /B python !SCRIPT! !TOTAL_STEPS! !MAX_EPISODE_STEPS! !TIMESCALE!
        timeout /t 5 /nobreak >nul
    ) else (
        timeout /t 1 /nobreak >nul
    )
    goto SINGLE_LOOP
)

REM ============================================
REM PARALLEL ENVIRONMENT MODE
REM ============================================
if "%MODE%"=="2" (
    echo ============================================
    echo Parallel Environment Training
    echo ============================================
    echo.

    set SCRIPT=training\train_ppo_parallel_auto.py
    set PROCESS_NAME=train_ppo_parallel_auto.py

    set /p NUM_ENVS="Number of parallel environments? (default: %DEFAULT_NUM_ENVS%): "
    if "%NUM_ENVS%"=="" set NUM_ENVS=%DEFAULT_NUM_ENVS%

    set /p TOTAL_STEPS="Total training steps? (default: %DEFAULT_TOTAL_STEPS%): "
    if "%TOTAL_STEPS%"=="" set TOTAL_STEPS=%DEFAULT_TOTAL_STEPS%

    set /p MAX_EPISODE_STEPS="Max steps per episode? (default: %DEFAULT_MAX_EPISODE_STEPS%): "
    if "%MAX_EPISODE_STEPS%"=="" set MAX_EPISODE_STEPS=%DEFAULT_MAX_EPISODE_STEPS%

    echo.
    echo Configuration:
    echo   Mode: Parallel ^(!NUM_ENVS! environments^)
    echo   Speedup: ~!NUM_ENVS!x faster
    echo   Total training steps: !TOTAL_STEPS!
    echo   Max steps per episode: !MAX_EPISODE_STEPS!
    echo.
    echo Starting parallel training with auto-restart...
    echo This will open !NUM_ENVS! browser tabs
    echo Press Ctrl+C to stop
    echo.

    REM Cleanup any existing processes
    echo Cleaning up old processes...
    taskkill /F /IM python.exe /FI "WINDOWTITLE eq *train_ppo_parallel_auto.py*" >nul 2>&1

    REM Free up ports
    for /L %%p in (8765,1,8790) do (
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p" ^| findstr "LISTENING"') do (
            taskkill /F /PID %%a >nul 2>&1
        )
    )
    timeout /t 1 /nobreak >nul

    REM Monitor loop
    :PARALLEL_LOOP
    tasklist /FI "IMAGENAME eq python.exe" /FI "WINDOWTITLE eq *!PROCESS_NAME!*" 2>nul | find /I "python.exe" >nul
    if errorlevel 1 (
        echo.
        echo %date% %time%: Parallel training not running - starting it...
        echo.
        start /B python !SCRIPT! !NUM_ENVS! !TOTAL_STEPS! !MAX_EPISODE_STEPS!
        timeout /t 5 /nobreak >nul
    ) else (
        timeout /t 1 /nobreak >nul
    )
    goto PARALLEL_LOOP
)

REM ============================================
REM INDEPENDENT PROCESSES MODE
REM ============================================
if "%MODE%"=="3" (
    echo ============================================
    echo Independent Process Training
    echo ============================================
    echo.

    set SCRIPT=training\train_single_env.py

    set /p NUM_ENVS="Number of parallel environments? (default: %DEFAULT_NUM_ENVS%): "
    if "%NUM_ENVS%"=="" set NUM_ENVS=%DEFAULT_NUM_ENVS%

    set /p TOTAL_STEPS="Total training steps per environment? (default: %DEFAULT_TOTAL_STEPS%): "
    if "%TOTAL_STEPS%"=="" set TOTAL_STEPS=%DEFAULT_TOTAL_STEPS%

    set /p MAX_EPISODE_STEPS="Max steps per episode? (default: %DEFAULT_MAX_EPISODE_STEPS%): "
    if "%MAX_EPISODE_STEPS%"=="" set MAX_EPISODE_STEPS=%DEFAULT_MAX_EPISODE_STEPS%

    set TIMESCALE=%DEFAULT_TIMESCALE%

    echo.
    echo Configuration:
    echo   Mode: Independent processes ^(!NUM_ENVS! environments^)
    echo   Each environment runs in isolated process
    echo   Individual auto-restart on failure ^(FAST RECOVERY^)
    echo   Total training steps per env: !TOTAL_STEPS!
    echo   Max steps per episode: !MAX_EPISODE_STEPS!
    echo   Timescale: !TIMESCALE!x
    echo.
    echo Starting independent training processes...
    echo This will open !NUM_ENVS! browser tabs/windows
    echo Each process will restart independently
    echo Press Ctrl+C to stop all
    echo.

    REM Thorough cleanup of existing processes and ports
    echo Cleaning up old processes and ports...
    echo This ensures all ports are free before starting
    echo.

    REM Kill ALL training scripts
    taskkill /F /IM python.exe /FI "WINDOWTITLE eq *train_single_env.py*" >nul 2>&1
    taskkill /F /IM python.exe /FI "WINDOWTITLE eq *train_ppo_parallel_auto.py*" >nul 2>&1
    taskkill /F /IM python.exe /FI "WINDOWTITLE eq *train_ppo_continue.py*" >nul 2>&1

    REM Wait for processes to die
    timeout /t 1 /nobreak >nul

    REM Free up each port individually with verification
    set PORTS_CLEANED=0
    for /L %%p in (8765,1,8790) do (
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%p" ^| findstr "LISTENING" 2^>nul') do (
            echo   Freeing port %%p...
            taskkill /F /PID %%a >nul 2>&1
            set /a PORTS_CLEANED+=1
        )
    )

    if !PORTS_CLEANED! GTR 0 (
        echo   Freed !PORTS_CLEANED! ports
    ) else (
        echo   All ports already free
    )

    REM Extra wait for ports to fully release
    timeout /t 2 /nobreak >nul

    echo Cleanup complete!
    echo.

    REM Launch Python processes FIRST - this ensures websockets are listening before browsers connect
    echo Launching !NUM_ENVS! independent training processes...
    echo Each process has its own persistent websocket and auto-restart loop
    echo.

    REM Create logs directory for process outputs
    if not exist ".\logs\process_logs" mkdir ".\logs\process_logs"

    set /a END_ENV=!NUM_ENVS!-1
    for /L %%i in (0,1,!END_ENV!) do (
        set /a PORT=8765+%%i
        set LOG_FILE=.\logs\process_logs\env_%%i.log

        REM Start Python process in background with output redirected to log
        start /B cmd /c "python -u !SCRIPT! %%i !PORT! !TOTAL_STEPS! !MAX_EPISODE_STEPS! !TIMESCALE! > !LOG_FILE! 2>&1"

        REM Give process time to start
        timeout /t 1 /nobreak >nul
    )

    echo.
    echo   Launched !NUM_ENVS! processes
    echo.
    echo Waiting 8 seconds for websocket servers to start...
    timeout /t 8 /nobreak >nul
    echo.

    REM Verify processes started successfully
    set RUNNING_COUNT=0
    for /f %%a in ('tasklist /FI "IMAGENAME eq python.exe" ^| find /C "python.exe"') do set RUNNING_COUNT=%%a
    echo Process check: !RUNNING_COUNT!/!NUM_ENVS! Python processes running
    echo.

    REM Open browser tabs/windows
    echo Opening !NUM_ENVS! browser tabs...
    for /L %%i in (0,1,!END_ENV!) do (
        set /a PORT=8765+%%i
        set URL=http://localhost:4200?wsPort=!PORT!^&maxSteps=!MAX_EPISODE_STEPS!

        REM Windows: use start to open in default browser
        start chrome "!URL!"

        timeout /t 1 /nobreak >nul
    )

    echo   Opened !NUM_ENVS! tabs
    echo.
    echo ================================================
    echo All !NUM_ENVS! training processes running!
    echo ================================================
    echo.
    echo How it works:
    echo   - Browser tabs stay open
    echo   - Websocket servers stay alive
    echo   - Only ML training loop restarts on timeout
    echo   - Fast recovery ^(^< 1 second^)
    echo.
    echo Press Ctrl+C to stop everything
    echo.

    REM Wait indefinitely (or until Ctrl+C)
    pause
)

REM Invalid mode
if not "%MODE%"=="1" if not "%MODE%"=="2" if not "%MODE%"=="3" (
    echo Invalid mode selected. Please choose 1, 2, or 3.
    pause
    exit /b 1
)
