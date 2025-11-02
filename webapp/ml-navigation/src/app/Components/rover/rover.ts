// src/app/Components/rover/rover.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { WindowSizeService } from '../../services/window-size';
import { Subscription } from 'rxjs';
import { EnvironmentComponent } from '../../../environment/environment';
import p5 from 'p5';
import { App } from '../../app';
import { ResetTrigger } from '../../services/reset-trigger';
import { RoverCollisionDetector } from './rover_reset';

@Component({
  selector: 'app-rover',
  standalone: true,
  template: '', // rendering handled by p5
  styleUrls: ['./rover.css']
})
export class RoverComponent implements OnInit, OnDestroy {
  private windowSizeSubscription!: Subscription;
  private resetSubscription!: Subscription;
  private collisionDetector!: RoverCollisionDetector;
  environment = inject(EnvironmentComponent);
  App = inject(App);
  ResetTrigger = inject(ResetTrigger);

  // Properties
  window_width!: number;
  window_height!: number;
  grid_size: number = this.environment.grid_size;
  cell!: number;
  Rover_Stroke_Thickness!: number;
  Rover_Stroke_Color: number = 20;
  Rover_Width!: number;
  Rover_Height!: number;
  Rover_Radius!: number;
  Rover_Origin_X!: number;
  Rover_Origin_Y!: number;
  Wheel_Width!: number;
  Wheel_Height!: number;
  Wheel_Left_X!: number;
  Wheel_Right_X!: number;
  Wheel_Front_Y!: number;
  Wheel_Middle_Y!: number;
  Wheel_Back_Y!: number;
  Bucket_Width!: number;
  Bucket_Height!: number;
  Bucket_X!: number;
  Bucket_Y!: number;
  Bucket_Top_Radius!: number;
  Bucket_Bottom_Radius!: number;
  Bucket_Arm_Width!: number;
  Bucket_Arm_Height!: number;
  Bucket_Arm_Left_X!: number;
  Bucket_Arm_Right_X!: number;
  Bucket_Arm_Y!: number;

  // Bounding Box
  BoundingBox_Left!: number;   // Distance from center to left edge
  BoundingBox_Right!: number;  // Distance from center to right edge
  BoundingBox_Top!: number;    // Distance from center to top edge
  BoundingBox_Bottom!: number; // Distance from center to bottom edge
  BoundingBox_OffsetX!: number; //rover center to box center
  BoundingBox_OffsetY!: number; //rover center to box center
  public showBoundingBox: boolean = true;
  public bound_box_opacity: number = 50;

  // Rover State
  public x!: number;
  public y!: number;
  private theta: number = 0; // Current angle (degrees)
  private targetTheta: number = 0; // Target angle (from slider input)
  private speed!: number;
  private _speedMultiplier: number = 0;
  private _targetSpeedFromSlider: number = 0; // Speed target (from slider input)
  private turnSpeed: number = .25; // Degrees per frame
  private pressedKeys = new Set<string>();
  private speedThreshold: number = 0.1;

  set speedMultiplier(value: number) {
    const isKeyOverride = this.pressedKeys.has('w') || this.pressedKeys.has('s');
    const isDisplayUpdate = Math.abs(value - this._speedMultiplier) < 0.01;

    if (!isDisplayUpdate || !isKeyOverride) {
      this._targetSpeedFromSlider = value;
    }

    if (!isKeyOverride) {
      this._speedMultiplier = value;
      this.updateSpeed();
    }
  }

  private updateSpeed(): void {
    this.speed = this._speedMultiplier * 0.1 * 0.25 * this.cell;
  }

  private normalizeAngle(angle: number): number {
    angle = angle % 360;
    return angle < 0 ? angle + 360 : angle;
  }

  get speedMultiplier(): number {
    return this._targetSpeedFromSlider;
  }

  get currentSpeed(): number {
    return this._speedMultiplier;
  }

  set targetHeading(value: number) {
    this.targetTheta = value;
  }

  get currentHeading(): number {
    return this.theta;
  }

  // Center position (using rover origin offset)
  get centerX(): number {
    return this.x + this.Rover_Origin_X;
  }

  get centerY(): number {
    return this.y + this.Rover_Origin_Y;
  }

  constructor(private windowSizeService: WindowSizeService) {
    const { width, height } = this.windowSizeService.windowSizeSubject.getValue();
    this.updateProperties(height);
  }

  private clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

  private updateProperties(windowHeight: number) {
    // scaling using environment dimensions
    this.window_width = this.environment.environment_width_px;
    this.window_height = this.environment.environment_height_px;
    this.cell = this.window_height / this.grid_size;

    // Use centralized conversion function
    this.Rover_Height = this.environment.metersToPixels(this.environment.rover_length_meters / 2);

    // 3:5 width:height ratio
    this.Rover_Width = this.Rover_Height * 0.6;

    // Scale properties proportionally
    const heightScale = this.Rover_Height / 5; // Base scale factor (original was 5 cells)
    this.Rover_Stroke_Thickness = 0.25 * heightScale;
    this.Rover_Radius = 0.5 * heightScale;
    this.Rover_Origin_X = this.Rover_Width / 2;
    this.Rover_Origin_Y = this.Rover_Height / 2;

    // Wheel Properties
    this.Wheel_Width = this.Rover_Width / 4;
    this.Wheel_Height = this.Rover_Height / 4;
    this.Wheel_Left_X = -(3 / 4) * this.Rover_Width;
    this.Wheel_Right_X = (1 / 2) * this.Rover_Width;
    this.Wheel_Front_Y = -this.Rover_Height / 2;
    this.Wheel_Middle_Y = -this.Rover_Height / 8;
    this.Wheel_Back_Y = this.Rover_Height / 4;

    // Bucket Properties
    this.Bucket_Width = this.Rover_Width * 1.375;
    this.Bucket_Height = this.Rover_Height / 5;
    this.Bucket_X = -this.Bucket_Width / 2;
    this.Bucket_Y = -this.Rover_Height / 1.25;
    this.Bucket_Top_Radius = this.Rover_Radius / 4;
    this.Bucket_Bottom_Radius = this.Rover_Radius * 1.5;
    this.Bucket_Arm_Width = this.Bucket_Height / 2.5;
    this.Bucket_Arm_Height = this.Bucket_Height * 1.5;
    this.Bucket_Arm_Left_X = -this.Bucket_Width / 5;
    this.Bucket_Arm_Right_X = -this.Bucket_Arm_Left_X - this.Bucket_Arm_Width;
    this.Bucket_Arm_Y = -this.Rover_Height / 2 - this.Bucket_Arm_Height / 1.5;

    // Calculate bounding box that encompasses all visual elements
    this.calculateBoundingBox();

    this.updateSpeed();
  }

  private calculateBoundingBox() {
    // Collect all edges to find extremes
    const allX = [
      -this.Rover_Width / 2, this.Rover_Width / 2,
      this.Wheel_Left_X, this.Wheel_Left_X + this.Wheel_Width,
      this.Wheel_Right_X, this.Wheel_Right_X + this.Wheel_Width,
      this.Bucket_X, this.Bucket_X + this.Bucket_Width,
      this.Bucket_Arm_Left_X, this.Bucket_Arm_Left_X + this.Bucket_Arm_Width,
      this.Bucket_Arm_Right_X, this.Bucket_Arm_Right_X + this.Bucket_Arm_Width
    ];

    const allY = [
      -this.Rover_Height / 2, this.Rover_Height / 2,
      this.Wheel_Front_Y, this.Wheel_Back_Y + this.Wheel_Height,
      this.Bucket_Y, this.Bucket_Y + this.Bucket_Height,
      this.Bucket_Arm_Y, this.Bucket_Arm_Y + this.Bucket_Arm_Height
    ];

    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    // Calculate offset and half-extents
    this.BoundingBox_OffsetX = (minX + maxX) / 2;
    this.BoundingBox_OffsetY = (minY + maxY) / 2;

    const halfWidth = (maxX - minX) / 2;
    const halfHeight = (maxY - minY) / 2;

    this.BoundingBox_Left = halfWidth;
    this.BoundingBox_Right = halfWidth;
    this.BoundingBox_Top = halfHeight;
    this.BoundingBox_Bottom = halfHeight;
  }

  ngOnInit() {
    // Initialize rover position
    this.x = this.environment.rover_start_x_px - this.Rover_Origin_X;
    this.y = this.environment.rover_start_y_px - this.Rover_Origin_Y;

    // Initialize collision detector
    this.collisionDetector = new RoverCollisionDetector(this.ResetTrigger, this.environment);

    // Subscribe to window size changes
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {
      // old dimensions and position
      const oldWidth = this.window_width;
      const oldHeight = this.window_height;
      const oldX = this.x;
      const oldY = this.y;

      // Update new window size
      this.updateProperties(height);

      // Scale rover position based on window
      if (oldWidth && oldHeight) {
        const widthRatio = this.window_width / oldWidth;
        const heightRatio = this.window_height / oldHeight;
        this.x = oldX * widthRatio;
        this.y = oldY * heightRatio;
      }
    });

    // Subscribe to reset trigger
    this.resetSubscription = this.ResetTrigger.reset$.subscribe(() => {
      this.resetRoverPosition();
    });
  }

  private resetRoverPosition() {
    // Reset position to start position
    this.x = this.environment.rover_start_x_px - this.Rover_Origin_X;
    this.y = this.environment.rover_start_y_px - this.Rover_Origin_Y;

    // Reset rotation
    this.theta = 0;
    this.targetTheta = 0;

    // Reset speed
    this._speedMultiplier = 0;
    this._targetSpeedFromSlider = 0;
    this.updateSpeed();
  }

  ngOnDestroy() {
    if (this.windowSizeSubscription) {
      this.windowSizeSubscription.unsubscribe();
    }
    if (this.resetSubscription) {
      this.resetSubscription.unsubscribe();
    }
  }

  update(p: p5) {
    const rotationModifier = this._speedMultiplier >= 0 ? 1 : -1;

    // Apply movement if above threshold
    if (Math.abs(this._speedMultiplier) > this.speedThreshold) {
      this.x += this.speed * p.sin(this.theta);
      this.y -= this.speed * p.cos(this.theta);
    }

    // Keys override slider
    if (this.pressedKeys.has('w')) {
      this._speedMultiplier = 1;
      this.updateSpeed();
    } else if (this.pressedKeys.has('s')) {
      this._speedMultiplier = -1;
      this.updateSpeed();
    } else {
      this._speedMultiplier = this._targetSpeedFromSlider;
      this.updateSpeed();
    }

    // Keyboard rotation
    const keyboardRotation = this.pressedKeys.has('a') || this.pressedKeys.has('d');
    if (this.pressedKeys.has('a')) {
      this.theta -= this.turnSpeed * rotationModifier;
      this.targetTheta = this.theta;
    }
    if (this.pressedKeys.has('d')) {
      this.theta += this.turnSpeed * rotationModifier;
      this.targetTheta = this.theta;
    }

    // Slider rotation
    if (!keyboardRotation) {
      const diff = this.targetTheta - this.theta;
      if (Math.abs(diff) > 0.1) {
        this.theta += Math.min(Math.abs(diff), this.turnSpeed) * Math.sign(diff);
      }
    }

    this.theta = this.normalizeAngle(this.theta);
    this.targetTheta = this.normalizeAngle(this.targetTheta);

    // Get collidable objects from zone display
    const collidableObjects = this.environment.zoneDisplay?.collidableObjects || [];

    this.collisionDetector.checkCollisions(
      this.centerX,
      this.centerY,
      this.BoundingBox_OffsetX,
      this.BoundingBox_OffsetY,
      this.BoundingBox_Left,
      this.BoundingBox_Right,
      this.BoundingBox_Top,
      this.BoundingBox_Bottom,
      this.theta,
      collidableObjects  // Pass the collidable objects
    );

  }

  draw(p: p5) {
    p.push();
    p.translate(this.x + this.Rover_Origin_X, this.y + this.Rover_Origin_Y); // Center of rover
    p.rotate(this.theta); //p.angleMode(p.DEGREES) must set in sketch

    // Rover Body
    p.fill(100, 100, 100);
    p.strokeWeight(this.Rover_Stroke_Thickness);
    p.stroke(this.Rover_Stroke_Color);
    p.rect(-this.Rover_Width / 2, -this.Rover_Height / 2, this.Rover_Width, this.Rover_Height, this.Rover_Radius);

    // Wheels
    p.fill(25, 25, 25);
    p.strokeWeight(this.Rover_Stroke_Thickness);
    p.stroke(this.Rover_Stroke_Color);
    p.rect(this.Wheel_Left_X, this.Wheel_Front_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(this.Wheel_Left_X, this.Wheel_Middle_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(this.Wheel_Left_X, this.Wheel_Back_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(this.Wheel_Right_X, this.Wheel_Front_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(this.Wheel_Right_X, this.Wheel_Middle_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(this.Wheel_Right_X, this.Wheel_Back_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);

    // Front Digging Bucket
    p.fill(150, 150, 150);
    p.strokeWeight(this.Rover_Stroke_Thickness);
    p.stroke(this.Rover_Stroke_Color);
    p.rect(this.Bucket_Arm_Left_X, this.Bucket_Arm_Y, this.Bucket_Arm_Width, this.Bucket_Arm_Height, this.Rover_Radius);
    p.rect(this.Bucket_Arm_Right_X, this.Bucket_Arm_Y, this.Bucket_Arm_Width, this.Bucket_Arm_Height, this.Rover_Radius);
    p.rect(this.Bucket_X, this.Bucket_Y, this.Bucket_Width, this.Bucket_Height, this.Bucket_Top_Radius, this.Bucket_Top_Radius, this.Bucket_Bottom_Radius, this.Bucket_Bottom_Radius);

    // Draw bounding box if enabled
    if (this.showBoundingBox) {
      p.stroke(255, 0, 0, this.bound_box_opacity);
      p.strokeWeight(2);
      p.noFill();
      p.rectMode(p.CENTER);
      const boxWidth = (this.BoundingBox_Left + this.BoundingBox_Right) * 1.1;
      const boxHeight = (this.BoundingBox_Top + this.BoundingBox_Bottom) * 1.1;
      // Draw at offset position (bounding box center offset from rover body center)
      p.rect(this.BoundingBox_OffsetX, this.BoundingBox_OffsetY, boxWidth, boxHeight, this.Bucket_Top_Radius * 2);
      p.rectMode(p.CORNER); // Reset to default
    }

    p.pop();
  }

  keyPressed(event: KeyboardEvent) {
    this.pressedKeys.add(event.key.toLowerCase());
  }

  keyReleased(event: KeyboardEvent) {
    this.pressedKeys.delete(event.key.toLowerCase());
  }
}