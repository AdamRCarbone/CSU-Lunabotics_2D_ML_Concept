// src/app/app.component.ts
import { Component, HostListener, ViewChild, AfterViewInit, ChangeDetectorRef, NgZone, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { EnvironmentComponent } from '../environment/environment';
import { WindowSizeService } from './services/window-size';
import { UniversalSliderComponent } from './Components/universal_slider/universal-slider';
import { ParameterDisplay, Parameter } from "./Components/parameter_display/parameter-display";
import { ZoneLegend } from './Components/zone-legend/zone-legend';
import { DetectedObstacles } from './Components/detected-obstacles/detected-obstacles';
import { DetectedDiggableComponent } from './Components/detected-diggable/detected-diggable';
import { MLTrainingPanel } from './Components/ml-training-panel/ml-training-panel';
import { MLRewardsPanel } from './Components/ml-rewards-panel/ml-rewards-panel';
import { Zone } from './enums/zone.enum';
import { ResetTrigger } from './services/reset-trigger';
import { MLEnvironmentService } from './services/ml-environment';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, EnvironmentComponent, UniversalSliderComponent, ParameterDisplay, ZoneLegend, DetectedObstacles, DetectedDiggableComponent, MLTrainingPanel, MLRewardsPanel],
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
  public minimalMode: boolean = false;  // Only show environment canvas
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

  constructor(
    private windowSizeService: WindowSizeService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private resetTrigger: ResetTrigger,
    private mlEnvironment: MLEnvironmentService
  ) {
    this.windowSizeService.updateWindowSize(this.window_width, this.window_height);

    // Check for minimal mode in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    this.minimalMode = urlParams.get('minimal') === 'true';
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

    // Initialize ML environment service with environment reference
    this.mlEnvironment.setEnvironment(this.environment);

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
}