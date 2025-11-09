// src/app/app.component.ts
import { Component, HostListener, ViewChild, AfterViewInit, ChangeDetectorRef, NgZone, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { EnvironmentComponent } from '../environment/environment';
import { WindowSizeService } from './services/window-size';
import { UniversalSliderComponent } from './Components/universal_slider/universal-slider';
import { ParameterDisplay, Parameter } from "./Components/parameter_display/parameter-display";
import { ZoneLegend } from './Components/zone-legend/zone-legend';
import { DetectedObstacles } from './Components/detected-obstacles/detected-obstacles';
import { DetectedDiggableComponent } from './Components/detected-diggable/detected-diggable';
import { TrainingMonitor } from './Components/training-monitor/training-monitor';
import { Zone } from './enums/zone.enum';
import { ResetTrigger } from './services/reset-trigger';
import { InferenceService, ModelInfo } from './services/inference.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, EnvironmentComponent, UniversalSliderComponent, ParameterDisplay, ZoneLegend, DetectedObstacles, DetectedDiggableComponent, TrainingMonitor, FormsModule, CommonModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild(EnvironmentComponent) environment!: EnvironmentComponent;

  title = 'ml-navigation';
  public window_width = window.innerWidth;
  public window_height = window.innerHeight;
  public grid_size = 100;
  public cell_size = this.window_height / this.grid_size;
  public speedValue: number = 0;
  public rotationValue: number = 0;
  public positionParams: Parameter[] = [
    { name: 'x', value: '—' },
    { name: 'y', value: '—' }
  ];
  public positionParams_sigfig: number = 3;
  public currentZone: Zone = Zone.NONE;
  public digMode: boolean = false;
  public digModeParams: Parameter[] = [
    { name: 'Mode', value: 'OFF' }
  ];
  private resetSubscription?: Subscription;

  // View mode
  public viewMode: 'rover' | 'training' = 'rover';

  // AI Control properties
  public controlMode: 'manual' | 'ai' = 'manual';
  public modelPath: string = '';
  public aiRunning: boolean = false;
  public aiStatus: 'loading' | 'running' | 'error' | null = null;
  private aiLoopInterval?: any;

  constructor(
    private windowSizeService: WindowSizeService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private resetTrigger: ResetTrigger,
    private inferenceService: InferenceService
  ) {
    this.windowSizeService.updateWindowSize(this.window_width, this.window_height);
  }

  scaleRoverPosition(Axis: string, Coordinate: number): string {
    const environment_height = this.environment.environment_height_px;
    const environment_width = this.environment.environment_width_px;
    const x_width_meters = this.environment.environment_width_meters;
    const y_height_meters = this.environment.environment_height_meters;

    let scaledCoordinate: number;

    if (Axis === 'x') {
      // Convert pixel coordinate to meters (0 to x_width_meters)
      scaledCoordinate = (Coordinate / environment_width) * x_width_meters;
    } else if (Axis === 'y') {
      // Invert y-axis (canvas y=0 is top, we want y=0 at bottom)
      // Then convert to meters (0 to y_height_meters)
      scaledCoordinate = ((environment_height - Coordinate) / environment_height) * y_height_meters;
    } else {
      return '0';
    }

    return scaledCoordinate.toFixed(this.positionParams_sigfig);
  }

  getRoverPositionMeters(axis: 'x' | 'y'): string {
    if (!this.environment?.physicsEngine) return '—';

    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return '—';

    const value = axis === 'x' ?
      this.environment.pixelsToMeters(state.x) :
      this.environment.environment_height_meters - this.environment.pixelsToMeters(state.y);

    return value.toFixed(this.positionParams_sigfig);
  }

  updateRoverPosition() {
    this.positionParams = [
      { name: 'x', value: this.getRoverPositionMeters('x') },
      { name: 'y', value: this.getRoverPositionMeters('y') }
    ];
  }

  get detectedObstacles() {
    return this.environment?.frustum?.detectedCollidableObjects || [];
  }

  get detectedDiggables() {
    return this.environment?.frustum?.detectedDiggableObjects || [];
  }

  ngAfterViewInit() {
    this.updateRoverPosition();

    // Reset dig mode to OFF on initialization
    this.resetDigMode();

    // Subscribe to reset trigger to turn off dig mode on collision reset
    this.resetSubscription = this.resetTrigger.reset$.subscribe(() => {
      this.resetDigMode();
    });

    this.ngZone.runOutsideAngular(() => {
      setInterval(() => {
        if (this.environment) {
          this.ngZone.run(() => {
            const newRotation = this.environment.roverCurrentHeading;
            const newSpeed = this.environment.roverCurrentSpeed;

            if (Math.abs(this.rotationValue - newRotation) > 0.01 ||
                Math.abs(this.speedValue - newSpeed) > 0.01) {
              this.rotationValue = newRotation;
              this.speedValue = newSpeed;
            }

            // Update position parameters
            if (this.environment.rover) {
              this.updateRoverPosition();
              // Update current zone
              this.currentZone = this.environment.currentZone;
              this.cdr.markForCheck();
            }
          });
        }
      }, 50);
    });
  }

  ngOnDestroy() {
    if (this.resetSubscription) {
      this.resetSubscription.unsubscribe();
    }
    this.stopAI();
  }

  hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove the leading # if present
  hex = hex.replace(/^#/, '');

  // Check if it's a valid 6-character hex string
  if (hex.length !== 6 || !/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return null; // Invalid hex, return null or throw an error as needed
  }

  // Parse the r, g, b components
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return { r, g, b };
}

  // Generate random number in range
  public randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event) {
    this.window_width = window.innerWidth;
    this.window_height = window.innerHeight;
    this.cell_size = this.window_height / this.grid_size;
    this.windowSizeService.updateWindowSize(this.window_width, this.window_height);
  }

  private lastKeyPressTime: number = 0;

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'b' || event.key === 'B') {
      // Debounce to prevent rapid toggling
      const now = Date.now();
      if (now - this.lastKeyPressTime < 200) return; // Ignore if pressed within 200ms
      this.lastKeyPressTime = now;

      this.toggleDigMode();
    }
  }

  resetDigMode() {
    this.digMode = false;
    this.digModeParams = [
      { name: 'Mode', value: 'OFF' }
    ];

    // Update physics bodies for all diggable objects
    if (this.environment?.diggingField) {
      this.environment.diggingField.setDigMode(false);
    }
  }

  toggleDigMode() {
    if (!this.environment?.diggingField) return;

    // If trying to turn ON (grab)
    if (!this.digMode) {
      // Only allow if orbs are in grab zone AND no orbs currently grabbed
      const canGrab = this.environment.diggingField.canGrab();
      const hasGrabbed = this.environment.diggingField.hasGrabbedOrbs();

      if (!canGrab) {
        console.log('No orbs in grab zone - cannot grab');
        return;
      }

      if (hasGrabbed) {
        console.log('Already holding orbs - release first');
        return;
      }

      // Perform grab
      this.digMode = true;
      this.environment.diggingField.setDigMode(true);
    } else {
      // Turn OFF (release)
      this.digMode = false;
      this.environment.diggingField.setDigMode(false);
    }

    // Update UI
    this.digModeParams = [
      { name: 'Mode', value: this.digMode ? 'ON' : 'OFF' }
    ];
  }

  // AI Control Methods
  onControlModeChange() {
    if (this.controlMode === 'manual') {
      this.stopAI();
    }
  }

  onModelFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];

      // Get the full path (Electron/desktop apps have access to file.path)
      // For web browsers, we'll just get the file name
      const fullPath = (file as any).path || file.name;

      // Remove .zip extension if present
      this.modelPath = fullPath.replace(/\.zip$/i, '');

      console.log('Selected file:', file.name);
      console.log('Full path:', fullPath);
      console.log('Model path to send:', this.modelPath);
    }
  }

  async loadAndStartAI() {
    if (!this.modelPath || this.aiRunning) return;

    try {
      this.aiStatus = 'loading';
      console.log('Loading model:', this.modelPath);

      // Load the model on the inference server
      const result = await this.inferenceService.loadModel(this.modelPath);
      console.log('Model loaded:', result);

      this.aiStatus = 'running';
      this.aiRunning = true;

      // Start the AI control loop
      this.startAILoop();
    } catch (error) {
      console.error('Failed to load and start AI:', error);
      this.aiStatus = 'error';
      this.aiRunning = false;
    }
  }

  stopAI() {
    if (this.aiLoopInterval) {
      clearInterval(this.aiLoopInterval);
      this.aiLoopInterval = undefined;
    }
    this.aiRunning = false;
    this.aiStatus = null;

    // Reset manual controls
    this.speedValue = 0;
    this.rotationValue = 0;
  }

  private startAILoop() {
    // Run AI predictions at ~20Hz (50ms interval)
    this.aiLoopInterval = setInterval(async () => {
      if (!this.aiRunning || !this.environment) return;

      try {
        // Get current observation from environment
        const observation = this.getObservation();

        // Get action from inference server
        const action = await this.inferenceService.predict(observation);

        // Apply action to environment
        this.applyAction(action);
      } catch (error) {
        console.error('AI prediction error:', error);
        this.stopAI();
        this.aiStatus = 'error';
      }
    }, 50);
  }

  private getObservation(): number[] {
    if (!this.environment?.physicsEngine) return new Array(28).fill(0);

    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return new Array(28).fill(0);

    const detected = this.environment.frustum;

    // Rover position in meters
    const roverXMeters = this.environment.pixelsToMeters(state.x);
    const roverYMeters = this.environment.environment_height_meters - this.environment.pixelsToMeters(state.y);

    // Helper function to ensure no NaN or Infinity
    const sanitize = (value: number): number => {
      if (!isFinite(value) || isNaN(value)) return 0;
      return value;
    };

    // Build observation matching the Python environment (28 dimensions)
    const observation: number[] = [
      // Rover state (8 values)
      sanitize(roverXMeters),
      sanitize(roverYMeters),
      sanitize(state.vx || 0),
      sanitize(state.vy || 0),
      sanitize(state.angle),
      sanitize(state.angularVelocity || 0),
      Number(this.currentZone) || 0,
      this.digMode ? 1.0 : 0.0,
    ];

    // Helper function to calculate distance and angle to an object
    const calculateDistanceAngle = (obj: { x_meters: number; y_meters: number }): { distance: number; angle: number } => {
      const dx = obj.x_meters - roverXMeters;
      const dy = obj.y_meters - roverYMeters;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      return { distance: sanitize(distance), angle: sanitize(angle) };
    };

    // Detected obstacles (max 5, each with distance and angle)
    const obstacles = detected?.detectedCollidableObjects || [];
    for (let i = 0; i < 5; i++) {
      if (i < obstacles.length) {
        const { distance, angle } = calculateDistanceAngle(obstacles[i]);
        observation.push(distance, angle);
      } else {
        observation.push(0, 0);
      }
    }

    // Detected diggable orbs (max 5, each with distance and angle)
    const diggables = detected?.detectedDiggableObjects || [];
    for (let i = 0; i < 5; i++) {
      if (i < diggables.length) {
        const { distance, angle } = calculateDistanceAngle(diggables[i]);
        observation.push(distance, angle);
      } else {
        observation.push(0, 0);
      }
    }

    console.log('Observation:', observation);
    return observation;
  }

  private applyAction(action: number[] | undefined) {
    if (!action || action.length !== 3) {
      console.error('Invalid action:', action);
      return;
    }

    // action[0]: linear velocity (-1 to 1)
    // action[1]: angular velocity (0 to 360 degrees target heading)
    // action[2]: dig action (0 or 1)

    // Clamp values to valid ranges
    this.speedValue = Math.max(-1, Math.min(1, action[0] || 0));
    this.rotationValue = Math.max(0, Math.min(360, action[1] || 0));

    // Handle dig action
    const shouldDig = (action[2] || 0) > 0.5;
    if (shouldDig !== this.digMode) {
      this.toggleDigMode();
    }
  }
}