// src/app/Components/rover/rover.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { WindowSizeService } from '../../services/window-size';
import { Subscription } from 'rxjs';
import { EnvironmentComponent } from '../../../environment/environment';
import p5 from 'p5';
import { App } from '../../app';

@Component({
  selector: 'app-rover',
  standalone: true,
  template: '', // rendering handled by p5
  styleUrls: ['./rover.css']
})
export class RoverComponent implements OnInit, OnDestroy {
  private windowSizeSubscription!: Subscription;
  environment = inject(EnvironmentComponent);
  App = inject(App);

  // Properties to be updated
  window_width!: number;
  window_height!: number;
  grid_size: number = 50; // Match EnvironmentComponent
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

  // Rover State
  public x!: number;
  public y!: number;
  private theta: number = 0; // Current angle in degrees
  private targetTheta: number = 0; // Target angle from slider
  private speed!: number;
  private _speedMultiplier: number = 0;
  private _targetSpeedFromSlider: number = 0; // Speed target from slider
  private turnSpeed: number = .25; // Degrees per frame
  private pressedKeys = new Set<string>();

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

  // Center position (accounting for rover origin offset)
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

  private updateProperties(windowHeight: number) {
    // Use environment's actual dimensions for scaling
    this.window_width = this.environment.environment_width_px;
    this.window_height = this.environment.environment_height_px;
    this.cell = this.window_height / this.grid_size;

    // Calculate rover dimensions from rover_length_meters
    // Convert rover length from meters to pixels
    const metersToPixels = this.environment.environment_height_px / this.environment.environment_height_meters;
    this.Rover_Height = this.environment.rover_length_meters/2 * metersToPixels;

    // Maintain 3:5 width:height ratio (width = height * 0.6)
    this.Rover_Width = this.Rover_Height * 0.6;

    // Scale other properties proportionally to rover height
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

    this.updateSpeed();
  }

  ngOnInit() {
    // Initialize rover position
    this.x = this.environment.rover_start_x_px - this.Rover_Origin_X;
    this.y = this.environment.rover_start_y_px - this.Rover_Origin_Y;

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
  }

  ngOnDestroy() {
    if (this.windowSizeSubscription) {
      this.windowSizeSubscription.unsubscribe();
    }
  }

  update(p: p5) {
    const rotationModifier = this._speedMultiplier >= 0 ? 1 : -1;

    // Apply movement if above threshold
    if (Math.abs(this._speedMultiplier) > 0.1) {
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
  }

  draw(p: p5) {
    p.push();
    p.translate(this.x + this.Rover_Origin_X, this.y + this.Rover_Origin_Y); // Center of rover
    p.rotate(this.theta); // Make sure p.angleMode(p.DEGREES) is set in your sketch!

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

    p.pop();
  }

  keyPressed(event: KeyboardEvent) {
    this.pressedKeys.add(event.key.toLowerCase());
  }

  keyReleased(event: KeyboardEvent) {
    this.pressedKeys.delete(event.key.toLowerCase());
  }
}