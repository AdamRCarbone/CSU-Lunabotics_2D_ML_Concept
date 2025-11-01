// src/app/environment/environment.component.ts
import { Component, ElementRef, OnInit, OnDestroy, ViewChild, Input, effect, forwardRef } from '@angular/core';
import { RoverComponent } from '../app/Components/rover/rover';
import { WindowSizeService } from '../app/services/window-size';
import p5 from 'p5';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-environment',
  standalone: true,
  imports: [RoverComponent],
  template: `
    <div #canvasContainer></div>
    <app-rover #rover></app-rover>
  `,
  styleUrls: ['./environment.css']
})
export class EnvironmentComponent implements OnInit, OnDestroy {
  private p5Instance!: p5;
  private windowSizeSubscription!: Subscription;

  public environment_width: number;
  public environment_height: number;
  public grid_size = 50;
  public cell_size: number;
  public environment_border_radius: number;
  public environment_stroke_weight: number;
  public rover_start_x: number;
  public rover_start_y: number;
  public environment_x_width: number = 6.8; //meters
  public environment_y_height: number = 5; //meters
  public xy_scale_factor: number = 10;

  // Starting position in meters (0,0 is bottom-left, max is top-right)
  public rover_start_x_meters: number = 0.5; // meters from left edge
  public rover_start_y_meters: number = 0.5; // meters from bottom edge


  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef;
  @ViewChild('rover', { static: true }) rover!: RoverComponent;

  @Input() set roverSpeedMultiplier(value: number) {
    if (this.rover) {
      this.rover.speedMultiplier = value;
    }
  }

  @Input() set roverTargetHeading(value: number) {
    if (this.rover) {
      this.rover.targetHeading = value;
    }
  }

  get roverCurrentHeading(): number {
    return this.rover ? this.rover.currentHeading : 0;
  }

  get roverCurrentSpeed(): number {
    return this.rover ? this.rover.currentSpeed : 0;
  }

  constructor(private windowSizeService: WindowSizeService) {
    // Initialize with current window size
    const { width, height } = this.windowSizeService.windowSizeSubject.getValue();
    this.environment_width = height * this.environment_x_width / this.xy_scale_factor;
    this.environment_height = height * this.environment_y_height / this.xy_scale_factor;
    this.cell_size = this.environment_height / this.grid_size;
    this.environment_border_radius = this.cell_size / 2.5;
    this.environment_stroke_weight = this.cell_size / 2;

    // Convert meter-based starting position to pixel coordinates
    this.rover_start_x = (this.rover_start_x_meters / this.environment_x_width) * this.environment_width;
    this.rover_start_y = this.environment_height - ((this.rover_start_y_meters / this.environment_y_height) * this.environment_height);
  }

  ngOnInit() {
    // Subscribe to window size changes
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {

      this.environment_width = height * this.environment_x_width / this.xy_scale_factor;
      this.environment_height = height * this.environment_y_height / this.xy_scale_factor;
      this.cell_size = this.environment_height / this.grid_size;
      this.environment_border_radius = this.cell_size / 2.5;
      this.environment_stroke_weight = this.cell_size / 2;

      // Convert meter-based starting position to pixel coordinates
      this.rover_start_x = (this.rover_start_x_meters / this.environment_x_width) * this.environment_width;
      this.rover_start_y = this.environment_height - ((this.rover_start_y_meters / this.environment_y_height) * this.environment_height);

      // Reset rover position
      this.rover.x = this.rover_start_x;
      this.rover.y = this.rover_start_y;

      // Resize the p5.js canvas
      if (this.p5Instance) {
        this.p5Instance.resizeCanvas(this.environment_width, this.environment_height);
      }
    });

    // Initialize p5.js
    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(this.environment_width, this.environment_height);
        canvas.parent(this.canvasContainer.nativeElement);
        p.angleMode(p.DEGREES);
      };

      p.draw = () => {
        p.fill(220);
        p.stroke(150);

        const sw = this.environment_stroke_weight;
        p.strokeWeight(sw);
        const strokeOffset = sw / 2;

        const rectX = strokeOffset;
        const rectY = strokeOffset;

        const rectW = this.environment_width - sw;
        const rectH = this.environment_height - sw;
        const borderRadius = this.environment_border_radius * 5;

        // Adjusted rectangle
        p.rect(rectX, rectY, rectW, rectH, borderRadius);

        this.rover.update(p); // Update rover
        this.rover.draw(p);   // Render rover
      };

      p.keyPressed = (event: KeyboardEvent) => {
        this.rover.keyPressed(event);
      };

      p.keyReleased = (event: KeyboardEvent) => {
        this.rover.keyReleased(event);
      };
    });
  }

  ngOnDestroy() {
    if (this.p5Instance) {
      this.p5Instance.remove();
    }
    if (this.windowSizeSubscription) {
      this.windowSizeSubscription.unsubscribe();
    }
  }
}