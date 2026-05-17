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

  // REAL-WORLD UNITS (METERS) — defaults to KSC; updated by arena selector
  public environment_width_meters: number = 6.88;
  public environment_height_meters: number = 5.0;
  public rover_start_x_meters: number = 0.5; // meters from left edge
  public rover_start_y_meters: number = 0.5; // meters from bottom edge
  public rover_length_meters: number = 1.0; // rover body length in meters (not including bucket)
  public rover_width_meters:  number = 0.6; // rover body width
  public rover_start_rotation: number = 0; // initial rotation in degrees

  // Wall band — visible arena boundary, also fed to AI as sensor input
  public wallBand_meters: number = 0.3;
  public wallPanel_meters: number = 0.07; // thin wall panel thickness (matches deleted barrier style)
  get wallBand_px(): number { return this.metersToPixels(this.wallBand_meters); }

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

  @Input() set roverLeftMotor(value: number) {
    if (this.rover) this.rover.leftMotor = value;
  }

  @Input() set roverRightMotor(value: number) {
    if (this.rover) this.rover.rightMotor = value;
  }

  get roverCurrentLeftMotor(): number {
    return this.rover?.leftMotor ?? 0;
  }

  get roverCurrentRightMotor(): number {
    return this.rover?.rightMotor ?? 0;
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
      this.environment_width_px = (height * this.environment_width_meters / this.xy_scale_factor);
      this.environment_height_px = (height * this.environment_height_meters / this.xy_scale_factor);
      this.cell_size_px = this.environment_height_px / this.grid_size;
      this.environment_border_radius_px = this.cell_size_px;
      this.environment_stroke_weight_px = this.cell_size_px / 2;

      // Convert meter-based starting position to pixel coordinates
      this.rover_start_x_px = (this.rover_start_x_meters / this.environment_width_meters) * this.environment_width_px;
      this.rover_start_y_px = this.environment_height_px - ((this.rover_start_y_meters / this.environment_height_meters) * this.environment_height_px);

      if (this.p5Instance) {
        const wb = this.wallBand_px;
        this.p5Instance.resizeCanvas(
          this.environment_width_px  + 2 * wb + 8,
          this.environment_height_px + 2 * wb + 8
        );
      }
    });

    // Initialize p5.js
    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const wb = this.wallBand_px;
        const canvasWidth  = this.environment_width_px  + 2 * wb + 8;
        const canvasHeight = this.environment_height_px + 2 * wb + 8;
        const canvas = p.createCanvas(canvasWidth, canvasHeight);
        canvas.parent(this.canvasContainer.nativeElement);
        p.angleMode(p.DEGREES);
      };

      p.draw = () => {
        const wb   = this.wallBand_px;
        const wpx  = this.metersToPixels(this.wallPanel_meters); // thin wall panel px
        const pad  = 4; // outer border gap
        const ax   = wb + pad; // arena top-left in canvas
        const ay   = wb + pad;
        const aw   = this.environment_width_px;
        const ah   = this.environment_height_px;
        const cw   = aw + 2 * wb + 8;
        const ch   = ah + 2 * wb + 8;

        // Page background colour so rounded corners blend in (matches #f0f0f2)
        p.background(240, 240, 242);

        p.push();

        // White card + thick rounded border matching zone border weight
        p.fill(255);
        p.stroke(170, 170, 180);
        p.strokeWeight(4);
        p.rect(2, 2, cw - 4, ch - 4, 14);

        // Arena background
        p.fill(220);
        p.noStroke();
        p.rect(ax, ay, aw, ah);

        // Clip to arena, translate so all components use arena-local coords (0,0)
        const ctx = (p as any).drawingContext as CanvasRenderingContext2D;
        ctx.save();
        ctx.beginPath();
        ctx.rect(ax, ay, aw, ah);
        ctx.clip();
        ctx.translate(ax, ay);

        this.physicsEngine.update();
        this.zoneDisplay.update(p);
        this.zoneDisplay.draw(p);
        this.obstacleField.update(p);
        this.obstacleField.draw(p);
        this.diggingField.update();
        this.diggingField.draw(p);
        this.frustum.draw(p);
        this.rover.update(p);
        this.rover.draw(p);

        ctx.restore();

        // 4 thin red wall panels flush against arena edges (same style as deleted barriers)
        p.fill(210, 40, 40, 220);
        p.stroke(160, 20, 20, 255);
        p.strokeWeight(2);
        p.rect(ax,        ay - wpx, aw,  wpx, 3); // N
        p.rect(ax,        ay + ah,  aw,  wpx, 3); // S
        p.rect(ax - wpx,  ay,       wpx, ah,  3); // W
        p.rect(ax + aw,   ay,       wpx, ah,  3); // E

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