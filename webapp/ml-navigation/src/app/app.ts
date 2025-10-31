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

  constructor(
    private windowSizeService: WindowSizeService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    this.windowSizeService.updateWindowSize(this.window_width, this.window_height);
  }

  updateRoverPosition() {
    this.positionParams = [
      { name: 'x', value: this.environment.rover.x.toFixed(2) },
      { name: 'y', value: this.environment.rover.y.toFixed(2) }
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
              this.cdr.markForCheck();
            }

            // Update position parameters
            if (this.environment.rover) {
              this.updateRoverPosition();
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