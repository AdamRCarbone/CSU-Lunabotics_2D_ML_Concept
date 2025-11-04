// src/app/app.component.ts
import { Component, HostListener, ViewChild, AfterViewInit, ChangeDetectorRef, NgZone, } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EnvironmentComponent } from '../environment/environment';
import { WindowSizeService } from './services/window-size';
import { UniversalSliderComponent } from './Components/universal_slider/universal-slider';
import { ParameterDisplay, Parameter } from "./Components/parameter_display/parameter-display";
import { ZoneLegend } from './Components/zone-legend/zone-legend';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, EnvironmentComponent, UniversalSliderComponent, ParameterDisplay, ZoneLegend],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements AfterViewInit {
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

  constructor(
    private windowSizeService: WindowSizeService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
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

  ngAfterViewInit() {
    this.updateRoverPosition();

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
              this.cdr.markForCheck();
            }
          });
        }
      }, 50);
    });
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
}