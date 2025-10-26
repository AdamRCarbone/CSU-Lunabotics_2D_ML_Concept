// src/app/Components/rover/rover.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { WindowSizeService } from '../../services/window-size';
import { Subscription } from 'rxjs';
import { EnvironmentComponent } from '../../../environment/environment';
import p5 from 'p5';

@Component({
  selector: 'app-rover',
  standalone: true,
  template: '', // rendering handled by p5
  styleUrls: ['./rover.css']
})
export class RoverComponent implements OnInit, OnDestroy {
  private windowSizeSubscription!: Subscription;
  environment = inject(EnvironmentComponent);

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
  private x!: number;
  private y!: number;
  private theta: number = 0; // Angle in degrees
  private speed!: number;
  private _speedMultiplier: number = 1;
  private turnSpeed: number = 1; // Degrees per frame
  private pressedKeys = new Set<string>();

  set speedMultiplier(value: number) {
    this._speedMultiplier = value;
    this.speed = this._speedMultiplier * 0.1 * this.cell;
  }

  get speedMultiplier(): number {
    return this._speedMultiplier;
  }

  constructor(private windowSizeService: WindowSizeService) {
    // Initialize with current window size
    const { width, height } = this.windowSizeService.windowSizeSubject.getValue();
    this.updateProperties(height);
    // Set initial position using environment's rover_start_x and rover_start_y
    this.x = this.environment.rover_start_x - this.Rover_Origin_X;
    this.y = this.environment.rover_start_y - this.Rover_Origin_Y;
  }

  private updateProperties(windowHeight: number) {
    // Match EnvironmentComponent's logic: environment_width/height = window_height / 1.5
    this.window_width = windowHeight / 1.5;
    this.window_height = windowHeight / 1.5;
    this.cell = this.window_height / this.grid_size;

    // Rover Properties
    this.Rover_Stroke_Thickness = 0.25 * this.cell;
    this.Rover_Width = this.cell * 3;
    this.Rover_Height = this.cell * 5;
    this.Rover_Radius = this.cell * 0.5;
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

    // Speed
    this.speed = this._speedMultiplier * 0.1 * this.cell;
  }

  ngOnInit() {
    // Subscribe to window size changes
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {
      // Store old dimensions and position before updating
      const oldWidth = this.window_width;
      const oldHeight = this.window_height;
      const oldX = this.x;
      const oldY = this.y;

      // Update properties with new window size
      this.updateProperties(height);

      // Scale rover position to maintain relative position
      if (oldWidth && oldHeight) { // Ensure old dimensions exist (not first call)
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
    let rotationModifier = this._speedMultiplier >= 0 ? 1 : -1;

    if (this.pressedKeys.has('w')) {
      this.x += this.speed * p.sin(this.theta);
      this.y -= this.speed * p.cos(this.theta);
    }
    if (this.pressedKeys.has('s')) {
      this.x -= this.speed * p.sin(this.theta);
      this.y += this.speed * p.cos(this.theta);
    }
    if (this.pressedKeys.has('a')) {
      this.theta -= this.turnSpeed * rotationModifier;
    }
    if (this.pressedKeys.has('d')) {
      this.theta += this.turnSpeed * rotationModifier;
    }
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