// src/app/app.component.ts
import { Component, HostListener, ViewChild, AfterViewInit, ChangeDetectorRef, NgZone, } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EnvironmentComponent } from '../environment/environment';
import { WindowSizeService } from './services/window-size';
import { UniversalSliderComponent } from './Components/universal_slider/universal-slider';
import { ParameterDisplay, Parameter } from "./Components/parameter_display/parameter-display";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, EnvironmentComponent, UniversalSliderComponent, ParameterDisplay],
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

  updateRoverPosition() {
    this.positionParams = [
      { name: 'x', value: this.scaleRoverPosition('x', this.environment.rover.centerX) },
      { name: 'y', value: this.scaleRoverPosition('y', this.environment.rover.centerY) }
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

  @HostListener('window:resize', ['$event'])
  onResize(event: Event) {
    this.window_width = window.innerWidth;
    this.window_height = window.innerHeight;
    this.cell_size = this.window_height / this.grid_size;
    this.windowSizeService.updateWindowSize(this.window_width, this.window_height);
  }
}