// src/app/Components/rover/rover-physics.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { WindowSizeService } from '../../services/window-size';
import { Subscription } from 'rxjs';
import { EnvironmentComponent } from '../../../environment/environment';
import p5 from 'p5';
import { App } from '../../app';
import { ResetTrigger } from '../../services/reset-trigger';
import { Body } from 'matter-js';

@Component({
  selector: 'app-rover',
  standalone: true,
  template: '', // rendering handled by p5
  styleUrls: ['./rover.css']
})
export class RoverPhysicsComponent implements OnInit, OnDestroy {
  private windowSizeSubscription!: Subscription;
  private resetSubscription!: Subscription;
  private physicsBody!: Body;
  environment = inject(EnvironmentComponent);
  app = inject(App);
  ResetTrigger = inject(ResetTrigger);

  // Visual Properties (for rendering)
  window_width!: number;
  window_height!: number;
  grid_size: number = this.environment.grid_size;
  cell!: number;
  Rover_Stroke_Thickness!: number;
  Rover_Stroke_Color: number = 20;
  Rover_Width!: number;
  Rover_Height!: number;
  Rover_Radius!: number;

  // Wheel and bucket dimensions for rendering
  Wheel_Width!: number;
  Wheel_Height!: number;
  Bucket_Width!: number;
  Bucket_Height!: number;
  Bucket_Top_Radius!: number;
  Bucket_Bottom_Radius!: number;

  // Movement properties
  private _speedMultiplier: number = 0;
  private _targetSpeedFromSlider: number = 0;
  public turnSpeed: number = .25; // Degrees per frame
  private pressedKeys = new Set<string>();
  private speedThreshold: number = 0.1;
  private targetTheta: number = 0;

  // Physics properties
  private maxSpeed: number = 2; // Max speed in physics units
  private maxAngularSpeed: number = 0.05; // Max angular velocity

  set speedMultiplier(value: number) {
    const isKeyOverride = this.pressedKeys.has('w') || this.pressedKeys.has('s');
    const isDisplayUpdate = Math.abs(value - this._speedMultiplier) < 0.01;

    if (!isDisplayUpdate || !isKeyOverride) {
      this._targetSpeedFromSlider = value;
    }

    if (!isKeyOverride) {
      this._speedMultiplier = value;
    }
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
    if (!this.physicsBody) return 0;
    return this.physicsBody.angle * 180 / Math.PI;
  }

  constructor(private windowSizeService: WindowSizeService) {
    const { width, height } = this.windowSizeService.windowSizeSubject.getValue();
    this.updateProperties(height);
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

    // Scale visual properties
    const heightScale = this.Rover_Height / 5;
    this.Rover_Stroke_Thickness = 0.25 * heightScale;
    this.Rover_Radius = 0.5 * heightScale;

    // Wheel Properties (for rendering)
    this.Wheel_Width = this.Rover_Width / 4;
    this.Wheel_Height = this.Rover_Height / 4;

    // Bucket Properties (for rendering)
    this.Bucket_Width = this.Rover_Width * 1.375;
    this.Bucket_Height = this.Rover_Height / 5;
    this.Bucket_Top_Radius = this.Rover_Radius / 4;
    this.Bucket_Bottom_Radius = this.Rover_Radius * 1.5;
  }

  ngOnInit() {
    // Create physics body for rover
    const startX = this.environment.rover_start_x_px;
    const startY = this.environment.rover_start_y_px;
    const rotation = this.environment.rover_start_rotation;

    // Create rover in physics engine
    this.physicsBody = this.environment.physicsEngine.createRover(
      startX,
      startY,
      this.Rover_Width * 1.2, // Slightly larger for collision
      this.Rover_Height * 1.2,
      rotation
    );

    // Create environment boundaries
    this.environment.physicsEngine.createBoundaries(
      this.environment.environment_width_px,
      this.environment.environment_height_px
    );

    // Add obstacles from obstacle field and zone display
    this.setupPhysicsObstacles();

    // Subscribe to window size changes
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {
      this.updateProperties(height);
    });

    // Subscribe to reset trigger
    this.resetSubscription = this.ResetTrigger.reset$.subscribe(() => {
      this.resetRoverPosition();
    });
  }

  private setupPhysicsObstacles() {
    // Get obstacles from obstacle field
    const obstacles = this.environment.obstacleField?.collidableObjects || [];
    obstacles.forEach(obstacle => {
      if (obstacle.type === 'rock' || obstacle.type === 'crater') {
        this.environment.physicsEngine.addObstacle(
          obstacle.x,
          obstacle.y,
          obstacle.radius,
          obstacle.type
        );
      }
    });

    // Get column post from zone display
    const zoneObjects = this.environment.zoneDisplay?.collidableObjects || [];
    zoneObjects.forEach(obj => {
      if (obj.type === 'rectangle') {
        this.environment.physicsEngine.addRectangleObstacle(
          obj.x,
          obj.y,
          obj.width,
          obj.height,
          'column'
        );
      }
    });
  }

  private resetRoverPosition() {
    // Randomize spawn position
    this.environment.randomizeRoverSpawn();

    // Reset physics body position
    this.environment.physicsEngine.resetRover(
      this.environment.rover_start_x_px,
      this.environment.rover_start_y_px,
      this.environment.rover_start_rotation
    );

    // Reset speed
    this._speedMultiplier = 0;
    this._targetSpeedFromSlider = 0;
    this.targetTheta = this.environment.rover_start_rotation;
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

    // Keys override slider
    if (this.pressedKeys.has('w')) {
      this._speedMultiplier = 1;
    } else if (this.pressedKeys.has('s')) {
      this._speedMultiplier = -1;
    } else {
      this._speedMultiplier = this._targetSpeedFromSlider;
    }

    // Calculate velocity based on current angle and speed
    const angle = this.physicsBody.angle;
    const speed = this._speedMultiplier * this.maxSpeed;

    // Apply velocity to physics body
    if (Math.abs(this._speedMultiplier) > this.speedThreshold) {
      const vx = Math.sin(angle) * speed;
      const vy = -Math.cos(angle) * speed;
      this.environment.physicsEngine.setRoverVelocity(vx, vy);
    } else {
      // Stop rover when no input
      this.environment.physicsEngine.setRoverVelocity(0, 0);
    }

    // Handle rotation
    let angularVelocity = 0;

    // Keyboard rotation
    if (this.pressedKeys.has('a')) {
      angularVelocity = -this.maxAngularSpeed * rotationModifier;
      this.targetTheta = this.currentHeading;
    } else if (this.pressedKeys.has('d')) {
      angularVelocity = this.maxAngularSpeed * rotationModifier;
      this.targetTheta = this.currentHeading;
    } else {
      // Slider rotation
      const currentAngle = this.currentHeading;
      const diff = this.targetTheta - currentAngle;
      if (Math.abs(diff) > 0.1) {
        angularVelocity = Math.min(Math.abs(diff) * 0.01, this.maxAngularSpeed) * Math.sign(diff);
      }
    }

    // Apply angular velocity
    this.environment.physicsEngine.setRoverAngularVelocity(angularVelocity);

    // Check for collisions (physics engine handles this internally)
    // If collision occurs, it will trigger reset through collision handler
  }

  draw(p: p5) {
    if (!this.physicsBody) return;

    const { x, y, angle } = this.environment.physicsEngine.getRoverState()!;

    p.push();
    p.translate(x, y);
    p.rotate(angle);

    // Rover Body
    p.fill(100, 100, 100);
    p.strokeWeight(this.Rover_Stroke_Thickness);
    p.stroke(this.Rover_Stroke_Color);
    p.rectMode(p.CENTER);
    p.rect(0, 0, this.Rover_Width, this.Rover_Height, this.Rover_Radius);

    // Simplified wheel rendering
    p.fill(25, 25, 25);
    const wheelOffsetX = this.Rover_Width * 0.4;
    const wheelOffsetY = this.Rover_Height * 0.35;

    // Left wheels
    p.rect(-wheelOffsetX, -wheelOffsetY, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(-wheelOffsetX, 0, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(-wheelOffsetX, wheelOffsetY, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);

    // Right wheels
    p.rect(wheelOffsetX, -wheelOffsetY, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(wheelOffsetX, 0, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(wheelOffsetX, wheelOffsetY, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);

    // Front Bucket
    p.fill(150, 150, 150);
    p.rect(0, -this.Rover_Height * 0.7, this.Bucket_Width, this.Bucket_Height,
           this.Bucket_Top_Radius, this.Bucket_Top_Radius,
           this.Bucket_Bottom_Radius, this.Bucket_Bottom_Radius);

    p.rectMode(p.CORNER); // Reset to default

    p.pop();
  }

  keyPressed(event: KeyboardEvent) {
    this.pressedKeys.add(event.key.toLowerCase());
  }

  keyReleased(event: KeyboardEvent) {
    this.pressedKeys.delete(event.key.toLowerCase());
  }
}