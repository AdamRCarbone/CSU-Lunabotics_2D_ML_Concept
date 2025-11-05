// src/app/environment/environment.component.ts
import { Component, ElementRef, OnInit, OnDestroy, ViewChild, Input, effect, forwardRef, inject } from '@angular/core';
import { RoverComponent } from '../app/Components/rover/rover';
import { WindowSizeService } from '../app/services/window-size';
import p5 from 'p5';
import { Subscription } from 'rxjs';
import { App } from '../app/app';
import { ZoneDisplay } from '../app/Components/zone_display/zone-display';
import { ObstacleField } from '../app/Components/obstacle_field/obstacle-field';
import { DiggingField } from '../app/Components/digging-field/digging-field';
import { Frustum } from '../app/Components/frustum/frustum';
import { PhysicsEngine } from '../app/physics/physics-engine';
import { Zone } from '../app/enums/zone.enum';

@Component({
  selector: 'app-environment',
  standalone: true,
  imports: [RoverComponent, ZoneDisplay, ObstacleField, DiggingField, Frustum],
  template: `
    <div #canvasContainer></div>
    <app-rover #rover></app-rover>
    <app-zone-display #zoneDisplay></app-zone-display>
    <app-obstacle-field #obstacleField></app-obstacle-field>
    <app-digging-field #diggingField></app-digging-field>
    <app-frustum #frustum></app-frustum>
  `,
  styleUrls: ['./environment.css']
})
export class EnvironmentComponent implements OnInit, OnDestroy {
  private p5Instance!: p5;
  private windowSizeSubscription!: Subscription;
  public physicsEngine!: PhysicsEngine;
  app = inject(App);

  // REAL-WORLD UNITS (METERS)
  public environment_width_meters: number = 6.8;
  public environment_height_meters: number = 5;
  public rover_start_x_meters: number = 0.5; // meters from left edge
  public rover_start_y_meters: number = 0.5; // meters from bottom edge
  public rover_length_meters: number = 1.5; // rover length/height in meters (y-axis)
  public rover_start_rotation: number = 0; // initial rotation in degrees

  // PIXEL-BASED PROPERTIES (RENDERING)
  public environment_width_px!: number;
  public environment_height_px!: number;
  public cell_size_px!: number;
  public environment_border_radius_px!: number;
  public environment_stroke_weight_px!: number;
  public rover_start_x_px!: number;
  public rover_start_y_px!: number;

  // GRID & SCALING
  public grid_size = 50; // Grid divisions for visualization
  public xy_scale_factor: number = 8; // Window height scaling factor


  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef;
  @ViewChild('rover', { static: true }) rover!: RoverComponent;
  @ViewChild('zoneDisplay', { static: true }) zoneDisplay!: ZoneDisplay;
  @ViewChild('obstacleField', { static: true }) obstacleField!: ObstacleField;
  @ViewChild('diggingField', { static: true }) diggingField!: DiggingField;
  @ViewChild('frustum', { static: true }) frustum!: Frustum;

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

  get currentZone(): Zone {
    return this.zoneDisplay ? this.zoneDisplay.currentZone : Zone.NONE;
  }

  // Meter/pixel conversion
  metersToPixels(meters: number): number {
    return meters * (this.environment_height_px / this.environment_height_meters);
  }

  pixelsToMeters(pixels: number): number {
    return pixels * (this.environment_height_meters / this.environment_height_px);
  }

  // Randomize rover spawn within starting zone
  randomizeRoverSpawn(): void {
    // Zone dimensions from zone-display component
    const startingZoneWidth = this.zoneDisplay.startingZone_width_meters;
    const startingZoneHeight = this.zoneDisplay.startingZone_height_meters;
    const padding = 0.4; // padding from edges to keep rover fully inside

    // Random position within safe bounds
    this.rover_start_x_meters = padding + Math.random() * (startingZoneWidth - 2 * padding);
    this.rover_start_y_meters = padding + Math.random() * (startingZoneHeight - 2 * padding);

    // Random rotation in increments of rover turnSpeed
    const turnSpeed = this.rover.turnSpeed;
    const maxIncrements = Math.floor(360 / turnSpeed);
    const randomIncrements = Math.floor(Math.random() * maxIncrements);
    this.rover_start_rotation = randomIncrements * turnSpeed;

    // Update pixel coordinates
    this.rover_start_x_px = (this.rover_start_x_meters / this.environment_width_meters) * this.environment_width_px;
    this.rover_start_y_px = this.environment_height_px - ((this.rover_start_y_meters / this.environment_height_meters) * this.environment_height_px);
  }

  constructor(private windowSizeService: WindowSizeService) {
    // Initialize using current window size
    const { width, height } = this.windowSizeService.windowSizeSubject.getValue();

    // Calculate pixel dimensions from meters
    this.environment_width_px = height * this.environment_width_meters / this.xy_scale_factor;
    this.environment_height_px = height * this.environment_height_meters / this.xy_scale_factor;
    this.cell_size_px = this.environment_height_px / this.grid_size;
    this.environment_border_radius_px = this.cell_size_px;
    this.environment_stroke_weight_px = this.cell_size_px / 2;

    // Set initial pixel coordinates (will be randomized in ngOnInit)
    this.rover_start_x_px = (this.rover_start_x_meters / this.environment_width_meters) * this.environment_width_px;
    this.rover_start_y_px = this.environment_height_px - ((this.rover_start_y_meters / this.environment_height_meters) * this.environment_height_px);
  }

  ngOnInit() {
    // Initialize physics engine
    this.physicsEngine = new PhysicsEngine();

    // Randomize rover spawn position and rotation
    this.randomizeRoverSpawn();

    // Subscribe to window size changes
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ height }) => {

      // Calculate pixel dimensions from meters
      this.cell_size_px = this.environment_height_px / this.grid_size;
      this.environment_border_radius_px = this.cell_size_px;
      this.environment_stroke_weight_px = this.cell_size_px / 2;

      this.environment_width_px = (height * this.environment_width_meters / this.xy_scale_factor);
      this.environment_height_px = (height * this.environment_height_meters / this.xy_scale_factor);

      // Convert meter-based starting position to pixel coordinates
      this.rover_start_x_px = (this.rover_start_x_meters / this.environment_width_meters) * this.environment_width_px;
      this.rover_start_y_px = this.environment_height_px - ((this.rover_start_y_meters / this.environment_height_meters) * this.environment_height_px);

      // Resize the p5.js canvas (add extra space for stroke)
      if (this.p5Instance) {
        const canvasWidth = this.environment_width_px + this.environment_stroke_weight_px;
        const canvasHeight = this.environment_height_px + this.environment_stroke_weight_px;
        this.p5Instance.resizeCanvas(canvasWidth, canvasHeight);
      }
    });

    // Initialize p5.js
    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvasWidth = this.environment_width_px + this.environment_stroke_weight_px + this.environment_stroke_weight_px;
        const canvasHeight = this.environment_height_px + this.environment_stroke_weight_px + this.environment_stroke_weight_px;
        const canvas = p.createCanvas(canvasWidth, canvasHeight);
        canvas.parent(this.canvasContainer.nativeElement);
        p.angleMode(p.DEGREES);
      };

      p.draw = () => {
        const sw = this.environment_stroke_weight_px;
        const strokeOffset = sw / 2;

        // Clear background
        p.background(255);

        // Use erase mode to create clipping by drawing everything to background,
        // then using blend mode to composite only inside the rounded rect
        p.push();

        // Draw environment background with stroke
        p.fill(220);
        p.stroke(150);
        p.strokeWeight(sw);
        p.rect(strokeOffset, strokeOffset, this.environment_width_px, this.environment_height_px, this.environment_border_radius_px);

        // Create a clipping region using drawingContext (raw canvas API)
        const ctx = (p as any).drawingContext as CanvasRenderingContext2D;
        ctx.save();
        ctx.beginPath();

        // Create rounded rectangle path manually
        const x = strokeOffset;
        const y = strokeOffset;
        const w = this.environment_width_px;
        const h = this.environment_height_px;
        const r = this.environment_border_radius_px;

        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.clip();

        // Update physics engine
        this.physicsEngine.update();

        this.zoneDisplay.update(p);    // Update zone display
        this.zoneDisplay.draw(p);      // Render zone display

        this.obstacleField.update(p);  // Update obstacle field
        this.obstacleField.draw(p);    // Render obstacles

        this.diggingField.update();    // Update digging field
        this.diggingField.draw(p);     // Render diggable orbs

        this.frustum.update(p);        // Update frustum
        this.frustum.draw(p);          // Render frustum (before rover so it's behind)

        this.rover.update(p);          // Update rover
        this.rover.draw(p);            // Render rover

        ctx.restore(); // End clipping

        // Redraw border on top
        p.noFill();
        p.stroke(150);
        p.strokeWeight(sw);
        p.rect(strokeOffset, strokeOffset, this.environment_width_px, this.environment_height_px, this.environment_border_radius_px);

        p.pop();

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
    if (this.physicsEngine) {
      this.physicsEngine.destroy();
    }
  }
}