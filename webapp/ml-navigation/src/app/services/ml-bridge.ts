// ML Bridge Service - WebSocket connection to Python training server

import { Injectable, inject } from '@angular/core';
import { MLEnvironmentService } from './ml-environment';
import { BrowserMessage, PythonMessage, arrayToAction } from '../interfaces/ml-types';
import { Subject, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MLBridgeService {
  private mlEnvironment = inject(MLEnvironmentService);

  private socket: WebSocket | null = null;
  private reconnectInterval: any = null;
  private isTraining: boolean = false;
  private wakeLock: any = null; // WakeLock API for preventing sleep
  private keepAliveInterval: any = null; // Heartbeat to keep connection alive
  private silentAudio: HTMLAudioElement | null = null; // Silent audio to prevent throttling
  private lastActionTime: number = 0; // Track when we last received an action from Python

  // LATENCY FIX: Action buffering for smooth movement
  private actionBuffer: number[][] = []; // Buffer of pre-computed actions
  private currentAction: number[] = [0, 0, 0]; // Current action being applied
  private readonly ACTION_BUFFER_SIZE = 3; // Keep 3 actions buffered

  // LATENCY FIX: Pipelined mode - don't wait for response before sending next state
  private usePipelineMode: boolean = true;
  private pendingStates: number = 0; // Track how many states we've sent without responses

  // LATENCY FIX: Game loop for continuous action application
  private gameLoopInterval: any = null;
  private readonly GAME_LOOP_FPS = 60; // Apply actions at 60 FPS

  // Observable for connection status
  public connectionStatus$ = new BehaviorSubject<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Observable for training status
  public trainingStatus$ = new BehaviorSubject<boolean>(false);

  // Observable for episode statistics
  public episodeStats$ = new Subject<any>();

  // Observable for checkpoint information
  public checkpointInfo$ = new BehaviorSubject<{ name: string; steps: number } | null>(null);

  // Observable for parallel training information
  public parallelTrainingInfo$ = new BehaviorSubject<{ envCount: number; envId: number } | null>(null);

  // LATENCY FIX: Latency monitoring
  public latencyStats$ = new BehaviorSubject<{ avg: number; min: number; max: number; bufferSize: number }>({
    avg: 0,
    min: 0,
    max: 0,
    bufferSize: 0
  });
  private latencyMeasurements: number[] = [];
  private stateSentTime: number = 0;

  private WEBSOCKET_URL = 'ws://localhost:8765'; // Python server address (can be overridden by query param)
  private readonly RECONNECT_DELAY = 3000; // 3 seconds
  private readonly KEEP_ALIVE_INTERVAL = 30000; // 30 seconds heartbeat

  constructor() {
    console.log('[ML Bridge] Service initialized');

    // Check for query parameters for parallel training
    const urlParams = new URLSearchParams(window.location.search);
    const wsPort = urlParams.get('wsPort');
    const maxSteps = urlParams.get('maxSteps');

    if (wsPort) {
      this.WEBSOCKET_URL = `ws://localhost:${wsPort}`;
      console.log(`[ML Bridge] Using WebSocket port from URL: ${wsPort}`);

      // Configure max episode steps if provided
      if (maxSteps) {
        const maxEpisodeSteps = parseInt(maxSteps);
        if (!isNaN(maxEpisodeSteps) && maxEpisodeSteps > 0) {
          console.log(`[ML Bridge] Configuring max episode steps from URL: ${maxEpisodeSteps.toLocaleString()}`);
          this.mlEnvironment.setConfig({ max_episode_steps: maxEpisodeSteps });
        }
      }

      // Auto-connect when wsPort is provided
      console.log('[ML Bridge] Auto-connecting for parallel training...');
      this.autoConnect();
    }
  }

  /**
   * Auto-connect with retry logic for parallel training
   */
  private autoConnect() {
    let attempts = 0;
    const maxAttempts = 10;
    const retryDelay = 1000; // 1 second between attempts

    const tryConnect = () => {
      attempts++;
      console.log(`[ML Bridge] Auto-connect attempt ${attempts}/${maxAttempts}`);

      this.connect();

      // Check if connected after a short delay
      setTimeout(() => {
        if (this.connectionStatus$.value === 'connected') {
          console.log('[ML Bridge] Auto-connected successfully!');
          // Start training immediately
          console.log('[ML Bridge] Auto-starting training...');
          this.startTraining();
        } else if (attempts < maxAttempts) {
          // Retry if not connected yet
          console.log(`[ML Bridge] Not connected yet, retrying in ${retryDelay}ms...`);
          setTimeout(tryConnect, retryDelay);
        } else {
          console.log('[ML Bridge] Auto-connect failed after max attempts');
        }
      }, 500);
    };

    // Start first attempt immediately
    setTimeout(tryConnect, 100);
  }

  /**
   * Connect to Python training server
   */
  connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('[ML Bridge] Already connected');
      return;
    }

    console.log('[ML Bridge] Connecting to Python server...');
    this.connectionStatus$.next('connecting');

    try {
      this.socket = new WebSocket(this.WEBSOCKET_URL);

      this.socket.onopen = () => {
        console.log('[ML Bridge] Connected to Python server');
        this.connectionStatus$.next('connected');
        this.stopReconnecting();

        // Don't auto-resume - let the restart flow or startTraining() handle it
        // This prevents multiple resets being sent
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.socket.onerror = (error) => {
        console.error('[ML Bridge] WebSocket error:', error);
      };

      this.socket.onclose = () => {
        console.log('[ML Bridge] Disconnected from Python server');
        this.connectionStatus$.next('disconnected');
        this.socket = null;

        // Don't auto-reconnect - deadlock detection will trigger restart which includes reconnect
      };
    } catch (error) {
      console.error('[ML Bridge] Failed to create WebSocket:', error);
      this.connectionStatus$.next('disconnected');
      // No auto-reconnect
    }
  }

  /**
   * Disconnect from Python server
   */
  disconnect() {
    console.log('[ML Bridge] Disconnecting...');
    this.isTraining = false;
    this.trainingStatus$.next(false);
    this.stopReconnecting();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.connectionStatus$.next('disconnected');
  }

  /**
   * Start training mode
   */
  async startTraining() {
    console.log('[ML Bridge] Starting training mode');
    this.isTraining = true;
    this.trainingStatus$.next(true);

    // LATENCY FIX: Clear buffers
    this.actionBuffer = [];
    this.currentAction = [0, 0, 0];
    this.pendingStates = 0;
    this.latencyMeasurements = [];

    // Acquire wake lock to prevent browser sleep
    await this.acquireWakeLock();

    // Start silent audio to prevent tab throttling
    this.startSilentAudio();

    // Start keep-alive heartbeat
    this.startKeepAlive();

    // LATENCY FIX: Start game loop for continuous action application
    this.startGameLoop();

    // Connect if not already connected
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.connect();
    }

    // Send initial reset immediately
    console.log('[ML Bridge] Sending initial reset to Python...');
    this.sendReset();
  }

  /**
   * Stop training mode
   */
  stopTraining() {
    console.log('[ML Bridge] Stopping training mode');
    this.isTraining = false;
    this.trainingStatus$.next(false);

    // LATENCY FIX: Stop game loop
    this.stopGameLoop();

    // LATENCY FIX: Clear buffers
    this.actionBuffer = [];
    this.pendingStates = 0;

    // Release wake lock
    this.releaseWakeLock();

    // Stop silent audio
    this.stopSilentAudio();

    // Stop keep-alive heartbeat
    this.stopKeepAlive();
  }

  /**
   * LATENCY FIX: Start game loop for continuous action application
   */
  private startGameLoop() {
    if (this.gameLoopInterval) return;

    console.log(`[ML Bridge] Starting game loop at ${this.GAME_LOOP_FPS} FPS`);

    const frameTime = 1000 / this.GAME_LOOP_FPS;

    this.gameLoopInterval = setInterval(() => {
      if (this.isTraining && this.actionBuffer.length > 0) {
        this.applyBufferedAction();
      }
    }, frameTime);
  }

  /**
   * LATENCY FIX: Stop game loop
   */
  private stopGameLoop() {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
      console.log('[ML Bridge] Game loop stopped');
    }
  }

  /**
   * LATENCY FIX: Apply next action from buffer and step environment
   */
  private applyBufferedAction() {
    if (this.actionBuffer.length === 0) {
      // No actions available - robot will continue with last action
      return;
    }

    // Get next action from buffer
    const actionArray = this.actionBuffer.shift()!;
    this.currentAction = actionArray;

    const action = arrayToAction(actionArray);

    // Take step in environment
    const result = this.mlEnvironment.step(action);

    // In pipeline mode, send state immediately without waiting
    if (this.usePipelineMode && this.pendingStates < this.ACTION_BUFFER_SIZE) {
      this.sendState(result.observation, result.reward, result.done, result.info);
      this.pendingStates++;
    } else if (!this.usePipelineMode) {
      // Original synchronous mode
      this.sendState(result.observation, result.reward, result.done, result.info);
    }

    // Update latency stats
    this.updateLatencyStats();
  }

  /**
   * LATENCY FIX: Update latency statistics
   */
  private updateLatencyStats() {
    if (this.latencyMeasurements.length === 0) {
      this.latencyStats$.next({
        avg: 0,
        min: 0,
        max: 0,
        bufferSize: this.actionBuffer.length
      });
      return;
    }

    const avg = this.latencyMeasurements.reduce((a, b) => a + b, 0) / this.latencyMeasurements.length;
    const min = Math.min(...this.latencyMeasurements);
    const max = Math.max(...this.latencyMeasurements);

    this.latencyStats$.next({
      avg: Math.round(avg),
      min: Math.round(min),
      max: Math.round(max),
      bufferSize: this.actionBuffer.length
    });
  }

  /**
   * Send state to Python and wait for action
   */
  private sendState(observation: number[], reward: number, done: boolean, info: any) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('[ML Bridge] Cannot send state - not connected');
      return;
    }

    // LATENCY FIX: Record time when state is sent
    this.stateSentTime = performance.now();

    const message: BrowserMessage = {
      type: 'state',
      observation,
      reward,
      done,
      info
    };

    this.socket.send(JSON.stringify(message));

    // If episode done, send stats
    if (done) {
      this.episodeStats$.next(info);
    }
  }

  /**
   * Send reset notification to Python
   */
  private sendReset() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('[ML Bridge] Cannot send reset - not connected');
      return;
    }

    const observation = this.mlEnvironment.reset();

    const message: BrowserMessage = {
      type: 'reset_complete',
      observation,
      reward: 0,
      done: false,
      info: this.mlEnvironment.getEpisodeInfo()
    };

    this.socket.send(JSON.stringify(message));
    console.log('[ML Bridge] Reset sent to Python');
  }

  /**
   * Send restart command to Python (tells Python to stop training and wait for reset)
   */
  private sendRestartCommand() {
    console.log('[ML Bridge] Deadlock detected - initiating restart sequence');

    // If not connected, just log and return - don't create infinite reconnect loop
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('[ML Bridge] Cannot send restart - not connected to Python');
      console.warn('[ML Bridge] Python may have crashed or failed to start');
      return;
    }

    // Send restart request
    const message = {
      type: 'restart_request'
    };

    this.socket.send(JSON.stringify(message));
    console.log('[ML Bridge] ✓ Restart command sent to Python');
    console.log('[ML Bridge] Python will stop training and wait for reset');

    // After delay, send reset to restart training
    setTimeout(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.log('[ML Bridge] ✓ Sending reset to restart training...');
        this.sendReset();
      } else {
        console.warn('[ML Bridge] Connection lost - cannot send reset');
      }
    }, 2000); // 2 second delay to let Python finish stopping
  }

  /**
   * Handle incoming message from Python
   */
  private handleMessage(data: string) {
    try {
      const message: PythonMessage = JSON.parse(data);

      if (message.type === 'action' && message.action) {
        this.handleAction(message.action);
      } else if (message.type === 'reset_request') {
        this.handleResetRequest();
      } else if (message.type === 'set_timescale' && message.timescale !== undefined) {
        this.handleTimescale(message.timescale);
      } else if (message.type === 'set_config' && message.max_episode_steps !== undefined) {
        this.handleConfig(message.max_episode_steps);
      } else if (message.type === 'checkpoint_info' && message.checkpoint_name && message.checkpoint_steps !== undefined) {
        this.handleCheckpointInfo(message.checkpoint_name, message.checkpoint_steps);
      } else if (message.type === 'parallel_training_info' && message.env_count !== undefined && message.env_id !== undefined) {
        this.handleParallelTrainingInfo(message.env_count, message.env_id);
      } else if (message.type === 'ready_to_resume') {
        this.handleReadyToResume();
      }
    } catch (error) {
      console.error('[ML Bridge] Failed to parse message:', error);
    }
  }

  /**
   * Handle action from Python
   * LATENCY FIX: Buffer actions instead of applying immediately
   */
  private handleAction(actionArray: number[]) {
    if (!this.isTraining) {
      console.warn('[ML Bridge] Received action but isTraining=false, ignoring');
      return;
    }

    // Track action received time
    this.lastActionTime = Date.now();

    // LATENCY FIX: Measure latency
    if (this.stateSentTime > 0) {
      const latency = performance.now() - this.stateSentTime;
      this.latencyMeasurements.push(latency);

      // Keep last 100 measurements
      if (this.latencyMeasurements.length > 100) {
        this.latencyMeasurements.shift();
      }
    }

    // LATENCY FIX: Decrement pending states counter
    if (this.pendingStates > 0) {
      this.pendingStates--;
    }

    // LATENCY FIX: Add action to buffer
    this.actionBuffer.push(actionArray);

    // Trim buffer if too large
    if (this.actionBuffer.length > this.ACTION_BUFFER_SIZE) {
      this.actionBuffer.shift(); // Remove oldest
    }

    // Log occasionally for debugging
    if (Math.random() < 0.01) { // 1% of the time
      console.log(`[ML Bridge] Action buffered. Buffer size: ${this.actionBuffer.length}, Latency: ${this.latencyMeasurements[this.latencyMeasurements.length - 1]?.toFixed(1)}ms`);
    }
  }

  /**
   * Handle reset request from Python
   */
  private handleResetRequest() {
    console.log('[ML Bridge] Reset requested by Python');
    this.sendReset();
  }

  /**
   * Handle timescale update from Python
   */
  private handleTimescale(timescale: number) {
    console.log(`[ML Bridge] Timescale set to ${timescale}x`);
    this.mlEnvironment.setTimescale(timescale);
  }

  /**
   * Handle configuration update from Python
   */
  private handleConfig(maxEpisodeSteps: number) {
    console.log(`[ML Bridge] Config received: max_episode_steps=${maxEpisodeSteps}`);
    this.mlEnvironment.setConfig({ max_episode_steps: maxEpisodeSteps });
  }

  /**
   * Handle checkpoint info from Python
   */
  private handleCheckpointInfo(name: string, steps: number) {
    console.log(`[ML Bridge] Checkpoint info received: ${name} (${steps.toLocaleString()} steps)`);
    this.checkpointInfo$.next({ name, steps });
  }

  /**
   * Handle parallel training info from Python
   */
  private handleParallelTrainingInfo(envCount: number, envId: number) {
    console.log(`[ML Bridge] Parallel training info received: ${envCount} environments (this is env ${envId})`);
    this.parallelTrainingInfo$.next({ envCount, envId });
  }

  /**
   * Handle ready_to_resume from Python (Python restarted and is waiting for reset)
   */
  private handleReadyToResume() {
    console.log('[ML Bridge] Python is ready to resume - sending reset to restart training');

    // Make sure we're still training
    if (!this.isTraining) {
      console.warn('[ML Bridge] Received ready_to_resume but not in training mode - ignoring');
      return;
    }

    // Send reset to resume training
    this.sendReset();
  }

  /**
   * Start auto-reconnection
   */
  private startReconnecting() {
    if (this.reconnectInterval) return;

    console.log('[ML Bridge] Starting auto-reconnect...');
    this.reconnectInterval = setInterval(() => {
      // Only reconnect if not already connected/connecting
      if (this.connectionStatus$.value === 'disconnected') {
        console.log('[ML Bridge] Attempting to reconnect...');
        this.connect();
      }
    }, this.RECONNECT_DELAY);
  }

  /**
   * Stop auto-reconnection
   */
  private stopReconnecting() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /**
   * Get training status
   */
  isTrainingActive(): boolean {
    return this.isTraining;
  }

  /**
   * Acquire wake lock to prevent browser/tab from sleeping
   */
  private async acquireWakeLock() {
    try {
      // Check if Wake Lock API is supported
      if ('wakeLock' in navigator) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        console.log('[ML Bridge] Wake lock acquired - screen will stay on');

        // Re-acquire wake lock if it's released (e.g., tab becomes inactive)
        this.wakeLock.addEventListener('release', () => {
          console.log('[ML Bridge] Wake lock released');
          if (this.isTraining) {
            console.log('[ML Bridge] Re-acquiring wake lock...');
            this.acquireWakeLock();
          }
        });
      } else {
        console.warn('[ML Bridge] Wake Lock API not supported - browser may sleep during training');
      }
    } catch (error) {
      console.error('[ML Bridge] Failed to acquire wake lock:', error);
    }
  }

  /**
   * Release wake lock
   */
  private releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
      console.log('[ML Bridge] Wake lock released');
    }
  }

  /**
   * Start keep-alive heartbeat to prevent connection timeout
   */
  private startKeepAlive() {
    if (this.keepAliveInterval) return;

    console.log('[ML Bridge] Starting keep-alive with anti-throttling measures');

    // Initialize action time
    this.lastActionTime = Date.now();

    // Aggressive anti-throttling measures:
    // 1. Update title frequently
    // 2. Log activity to console to keep DevTools active
    // 3. Touch DOM to trigger layout
    // 4. CRITICAL: Check for action timeout (rover movement stopped)
    this.keepAliveInterval = setInterval(() => {
      const time = new Date().toLocaleTimeString();
      document.title = `Training... [${time}]`;

      // Log to console - keeps DevTools active if open
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.debug(`[ML Bridge] Active - ${time}`);
      }

      // Touch DOM to prevent deep sleep
      document.body.setAttribute('data-training-time', Date.now().toString());

      // ACTION TIMEOUT CHECK: If no actions received for 1 second, Python is stuck
      // ONLY check if we're connected - don't trigger on initial connection failures
      if (this.isTraining && this.lastActionTime > 0 && this.socket && this.socket.readyState === WebSocket.OPEN) {
        const timeSinceLastAction = Date.now() - this.lastActionTime;
        const ACTION_TIMEOUT = 1000; // 1 second - Python should be sending actions constantly

        if (timeSinceLastAction > ACTION_TIMEOUT) {
          console.error(`[ML Bridge] NO ACTIONS for ${(timeSinceLastAction / 1000).toFixed(1)}s - Python ML is stuck!`);
          console.error('[ML Bridge] Triggering Python restart and disconnecting...');

          // Send restart command to Python
          this.sendRestartCommand();

          // Disconnect and reconnect to force fresh connection state
          console.log('[ML Bridge] Disconnecting and reconnecting in 2s...');
          setTimeout(() => {
            // Close current socket
            if (this.socket) {
              this.socket.close();
              this.socket = null;
            }

            // Wait a bit then reconnect
            setTimeout(() => {
              console.log('[ML Bridge] Reconnecting...');
              this.connect();

              // After reconnection, send reset to resume training
              setTimeout(() => {
                if (this.isTraining && this.socket && this.socket.readyState === WebSocket.OPEN) {
                  console.log('[ML Bridge] Sending reset to resume training...');
                  this.sendReset();
                }
              }, 1000);
            }, 1000);
          }, 2000);

          // Reset timer to prevent spam
          this.lastActionTime = Date.now();
        }
      }
    }, 1000); // Every 1 second to aggressively prevent throttling
  }

  /**
   * Stop keep-alive heartbeat
   */
  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      document.title = 'ML Navigation'; // Reset title
      console.log('[ML Bridge] Keep-alive stopped');
    }
  }

  /**
   * Start playing silent audio to prevent tab throttling
   * Chrome won't throttle tabs that are playing audio
   */
  private startSilentAudio() {
    if (this.silentAudio) return;

    try {
      // Create an AudioContext for generating silent audio
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContext();

      // Create an oscillator with near-silent volume
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Set to extremely low volume (effectively silent but Chrome still sees it as audio)
      gainNode.gain.value = 0.001;

      // Use a frequency at the edge of human hearing
      oscillator.frequency.value = 20; // 20 Hz - below typical human hearing range

      // Start the oscillator
      oscillator.start();

      // Store reference (cast as any since we're using AudioContext API)
      this.silentAudio = oscillator as any;

      console.log('[ML Bridge] Silent audio started (AudioContext) - tab should not be throttled');
    } catch (error) {
      console.warn('[ML Bridge] AudioContext approach failed, trying audio element:', error);

      // Fallback to audio element approach
      try {
        this.silentAudio = new Audio();
        const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
        this.silentAudio.src = silentWav;
        this.silentAudio.loop = true;
        this.silentAudio.volume = 0.01;

        this.silentAudio.play().then(() => {
          console.log('[ML Bridge] Silent audio started (Audio element) - tab should not be throttled');
        }).catch((err) => {
          console.warn('[ML Bridge] Both audio methods failed - keep window visible to prevent throttling');
        });
      } catch (err2) {
        console.error('[ML Bridge] All audio approaches failed:', err2);
      }
    }
  }

  /**
   * Stop playing silent audio
   */
  private stopSilentAudio() {
    if (this.silentAudio) {
      try {
        // Handle AudioContext oscillator
        if (typeof (this.silentAudio as any).stop === 'function') {
          (this.silentAudio as any).stop();
        }
        // Handle HTML Audio element
        else if (typeof (this.silentAudio as any).pause === 'function') {
          (this.silentAudio as any).pause();
        }
      } catch (e) {
        console.warn('[ML Bridge] Error stopping audio:', e);
      }
      this.silentAudio = null;
      console.log('[ML Bridge] Silent audio stopped');
    }
  }

  /**
   * Cleanup
   */
  ngOnDestroy() {
    this.stopGameLoop(); // LATENCY FIX: Stop game loop
    this.releaseWakeLock();
    this.stopSilentAudio();
    this.stopKeepAlive();
    this.disconnect();
  }
}
