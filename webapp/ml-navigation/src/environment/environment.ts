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

  // ===== REAL-WORLD UNITS (METERS) =====
  public environment_width_meters: number = 6.8;
  public environment_height_meters: number = 5;
  public rover_start_x_meters: number = 0.5; // meters from left edge (0 to 6.8)
  public rover_start_y_meters: number = 0.5; // meters from bottom edge (0 to 5)

  // ===== PIXEL-BASED PROPERTIES (FOR RENDERING) =====
  public environment_width_px!: number;
  public environment_height_px!: number;
  public cell_size_px!: number;
  public environment_border_radius_px!: number;
  public environment_stroke_weight_px!: number;
  public rover_start_x_px!: number;
  public rover_start_y_px!: number;

  // ===== GRID & SCALING =====
  public grid_size = 50; // Grid divisions for visualization
  public xy_scale_factor: number = 10; // Window height scaling factor


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

    // Calculate pixel dimensions from meters
    this.environment_width_px = height * this.environment_width_meters / this.xy_scale_factor;
    this.environment_height_px = height * this.environment_height_meters / this.xy_scale_factor;
    this.cell_size_px = this.environment_height_px / this.grid_size;
    this.environment_border_radius_px = this.cell_size_px;
    this.environment_stroke_weight_px = this.cell_size_px / 2;

    // Convert meter-based starting position to pixel coordinates
    this.rover_start_x_px = (this.rover_start_x_meters / this.environment_width_meters) * this.environment_width_px;
    this.rover_start_y_px = this.environment_height_px - ((this.rover_start_y_meters / this.environment_height_meters) * this.environment_height_px);
  }

  ngOnInit() {
    // Subscribe to window size changes
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {

      // Calculate pixel dimensions from meters
      this.environment_width_px = height * this.environment_width_meters / this.xy_scale_factor;
      this.environment_height_px = height * this.environment_height_meters / this.xy_scale_factor;
      this.cell_size_px = this.environment_height_px / this.grid_size;
      this.environment_border_radius_px = this.cell_size_px;
      this.environment_stroke_weight_px = this.cell_size_px / 2;

      // Convert meter-based starting position to pixel coordinates
      this.rover_start_x_px = (this.rover_start_x_meters / this.environment_width_meters) * this.environment_width_px;
      this.rover_start_y_px = this.environment_height_px - ((this.rover_start_y_meters / this.environment_height_meters) * this.environment_height_px);

      // Resize the p5.js canvas
      if (this.p5Instance) {
        this.p5Instance.resizeCanvas(this.environment_width_px, this.environment_height_px);
      }
    });

    // Initialize p5.js
    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(this.environment_width_px, this.environment_height_px);
        canvas.parent(this.canvasContainer.nativeElement);
        p.angleMode(p.DEGREES);
      };

      p.draw = () => {
        p.fill(220);
        p.stroke(150);

        const sw = this.environment_stroke_weight_px;
        p.strokeWeight(sw);
        const strokeOffset = sw / 2;

        const rectX = strokeOffset;
        const rectY = strokeOffset;

        const rectW = this.environment_width_px - sw;
        const rectH = this.environment_height_px - sw;
        const borderRadius = this.environment_border_radius_px;

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