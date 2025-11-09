// src/app/Components/rover/rover.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { WindowSizeService } from '../../services/window-size';
import { Subscription } from 'rxjs';
import { EnvironmentComponent } from '../../../environment/environment';
import p5 from 'p5';
import { App } from '../../app';
import { ResetTrigger } from '../../services/reset-trigger';
import { Body } from 'matter-js';
import { Zone } from '../../enums/zone.enum';

@Component({
  selector: 'app-rover',
  standalone: true,
  template: '', // rendering handled by p5
  styleUrls: ['./rover.css']
})
export class RoverComponent implements OnInit, OnDestroy {
  private windowSizeSubscription!: Subscription;
  private resetSubscription!: Subscription;
  private physicsBody!: Body;
  environment = inject(EnvironmentComponent);
  app = inject(App);
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
  public bound_box_opacity: number = 255;

  // Rover State
  private targetTheta: number = 0; // Target angle (from slider input)
  private _speedMultiplier: number = 0;
  private _targetSpeedFromSlider: number = 0; // Speed target (from slider input)
  private _mlTurnRate: number = 0; // ML agent turn rate (-1 to 1)
  public turnSpeed: number = .25; // Degrees per frame
  private pressedKeys = new Set<string>();
  private speedThreshold: number = 0.05;
  private maxSpeedChangeRate: number = 0.05; // Max speed change per frame (limits acceleration/deceleration)

  // Physics properties
  public YOLO = 1; //Set to 1 for normal speed
  private maxSpeed: number = 1 * this.YOLO; // Max speed in physics units
  private maxAngularSpeed: number = .01 * this.YOLO; // Max angular velocity

  // Zone tracking
  public currentZone: Zone = Zone.NONE;

  set speedMultiplier(value: number) {
    const isKeyOverride = this.pressedKeys.has('w') || this.pressedKeys.has('s');

    // Always set target speed, never directly set actual speed
    // This ensures rate limiting applies to slider input too
    if (!isKeyOverride) {
      this._targetSpeedFromSlider = value;
    }
  }

  set targetSpeed(value: number) {
    // Set target speed without directly modifying current speed
    // Allows for gradual acceleration/deceleration
    this._targetSpeedFromSlider = Math.max(-1, Math.min(1, value));
  }

  private normalizeAngle(angle: number): number {
    angle = angle % 360;
    return angle < 0 ? angle + 360 : angle;
  }

  get speedMultiplier(): number {
    // Return actual current speed, not target (for slider display)
    // This ensures slider reflects actual speed with rate limiting
    return this._speedMultiplier;
  }

  get currentSpeed(): number {
    // Round to nearest maxSpeedChangeRate increment for clean values
    return Math.round(this._speedMultiplier / this.maxSpeedChangeRate) * this.maxSpeedChangeRate;
  }

  set targetHeading(value: number) {
    this.targetTheta = this.normalizeAngle(value);
  }

  get currentHeading(): number {
    if (!this.physicsBody) return 0;
    const angleDegrees = this.physicsBody.angle * 180 / Math.PI;
    const normalized = this.normalizeAngle(angleDegrees);
    // Round to nearest turnSpeed increment
    return Math.round(normalized / this.turnSpeed) * this.turnSpeed;
  }

  set mlTurnRate(value: number) {
    // Clamp to -1 to 1 range
    this._mlTurnRate = Math.max(-1, Math.min(1, value));
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
    // Create physics body for rover
    const startX = this.environment.rover_start_x_px;
    const startY = this.environment.rover_start_y_px;
    const rotation = this.environment.rover_start_rotation;

    // Calculate actual bounding box size (including bucket and arms) - match visual exactly
    const boundingWidth = (this.BoundingBox_Left + this.BoundingBox_Right);
    const boundingHeight = (this.BoundingBox_Top + this.BoundingBox_Bottom);

    // Create rover in physics engine with proper bounding box and offset
    this.physicsBody = this.environment.physicsEngine.createRover(
      startX,
      startY,
      boundingWidth,
      boundingHeight,
      rotation,
      this.BoundingBox_OffsetX,  // Pass the offset to align physics with visual
      this.BoundingBox_OffsetY
    );

    // Create environment boundaries
    this.environment.physicsEngine.createBoundaries(
      this.environment.environment_width_px,
      this.environment.environment_height_px
    );

    // Add obstacles from obstacle field and zone display
    this.setupPhysicsObstacles();

    // Set collision callback to trigger reset
    this.environment.physicsEngine.setCollisionCallback(() => {
      this.ResetTrigger.triggerReset();
    });

    // Set initial target
    this.targetTheta = this.environment.rover_start_rotation;

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
    // Wait for components to be initialized
    setTimeout(() => {
      // Clear any existing obstacles first
      this.environment.physicsEngine.clearObstacles();

      // Get obstacles from obstacle field
      const obstacles = this.environment.obstacleField?.collidableObjects || [];
      console.log('Adding obstacles to physics:', obstacles.length);

      obstacles.forEach(obstacle => {
        // Convert from meters to pixels (x_meters is distance from left, y_meters from bottom)
        const x = (obstacle.x_meters / this.environment.environment_width_meters) * this.environment.environment_width_px;
        const y = this.environment.environment_height_px - ((obstacle.y_meters / this.environment.environment_height_meters) * this.environment.environment_height_px);

        if (obstacle.isCircular() && obstacle.radius_meters) {
          const radius = this.environment.metersToPixels(obstacle.radius_meters);
          const label = obstacle.name?.toLowerCase().includes('crater') ? 'crater' :
                       obstacle.name?.toLowerCase().includes('rock') ? 'rock' : 'obstacle';
          console.log(`Adding ${label} at (${x}, ${y}) with radius ${radius}`);
          this.environment.physicsEngine.addObstacle(x, y, radius, label);
        }
      });

      // Get column post from zone display
      const zoneObjects = this.environment.zoneDisplay?.collidableObjects || [];
      console.log('Adding zone objects to physics:', zoneObjects.length);

      zoneObjects.forEach(obj => {
        if (obj.isRectangular() && obj.width_meters && obj.height_meters) {
          // Column post position (center)
          const x = (obj.x_meters / this.environment.environment_width_meters) * this.environment.environment_width_px;
          const y = this.environment.environment_height_px - ((obj.y_meters / this.environment.environment_height_meters) * this.environment.environment_height_px);
          const width = this.environment.metersToPixels(obj.width_meters);
          const height = this.environment.metersToPixels(obj.height_meters);
          console.log(`Adding column at (${x}, ${y}) with size ${width}x${height}`);
          this.environment.physicsEngine.addRectangleObstacle(x, y, width, height, 'column');
        }
      });
    }, 200); // Slightly longer delay to ensure all components are fully initialized
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

    // Re-setup physics obstacles with newly regenerated positions
    this.setupPhysicsObstacles();

    // Reset speed and target
    this._speedMultiplier = 0;
    this._targetSpeedFromSlider = 0;
    this._mlTurnRate = 0;
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

    // Zone-based behavior logic can be implemented here using this.currentZone

    // Determine target speed based on input (keys override slider)
    let targetSpeed: number;
    if (this.pressedKeys.has('w')) {
      targetSpeed = 1;
    } else if (this.pressedKeys.has('s')) {
      targetSpeed = -1;
    } else {
      targetSpeed = this._targetSpeedFromSlider;
    }

    // Gradually change speed toward target (rate limiting)
    const speedDiff = targetSpeed - this._speedMultiplier;
    if (Math.abs(speedDiff) > 0.001) {
      // Clamp speed change to maxSpeedChangeRate
      const speedChange = this.clamp(speedDiff, -this.maxSpeedChangeRate, this.maxSpeedChangeRate);
      this._speedMultiplier += speedChange;
    } else {
      // Snap to target if very close
      this._speedMultiplier = targetSpeed;
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

    // Keyboard rotation (highest priority)
    if (this.pressedKeys.has('a')) {
      angularVelocity = -this.maxAngularSpeed * rotationModifier;
      this.targetTheta = this.currentHeading;
    } else if (this.pressedKeys.has('d')) {
      angularVelocity = this.maxAngularSpeed * rotationModifier;
      this.targetTheta = this.currentHeading;
    } else if (Math.abs(this._mlTurnRate) > 0.01) {
      // ML control (second priority)
      // -1 = turn left (counterclockwise), +1 = turn right (clockwise)
      angularVelocity = this._mlTurnRate * this.maxAngularSpeed * rotationModifier;
      this.targetTheta = this.currentHeading; // Don't interfere with slider
    } else {
      // Slider rotation (lowest priority)
      const currentAngle = this.currentHeading;
      let diff = this.targetTheta - currentAngle;

      // Normalize angle difference to take shortest path (-180 to 180)
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;

      if (Math.abs(diff) > 0.1) {
        angularVelocity = Math.min(Math.abs(diff) * 0.01, this.maxAngularSpeed) * Math.sign(diff);
      }
    }

    // Apply angular velocity
    this.environment.physicsEngine.setRoverAngularVelocity(angularVelocity);
  }

  draw(p: p5) {
    if (!this.physicsBody) return;

    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return;

    const { x, y, angle } = state;

    p.push();
    p.translate(x, y);
    p.rotate(angle);

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
      // Match the physics body size exactly
      const boxWidth = (this.BoundingBox_Left + this.BoundingBox_Right);
      const boxHeight = (this.BoundingBox_Top + this.BoundingBox_Bottom);
      // Draw at offset position (bounding box center offset from rover body center)
      p.rect(this.BoundingBox_OffsetX, this.BoundingBox_OffsetY, boxWidth, boxHeight, this.Bucket_Top_Radius * 2);

      // Draw grab zone at the bucket (front of rover) in BLUE
      const grabZoneHeight = boxHeight * 0.2; // 20% of bounding box height
      const grabZoneWidth = this.Bucket_Width; // Bucket width
      // Position moved back slightly from bucket front
      const grabZoneOffsetY = this.Bucket_Y + (this.Bucket_Height * 0.2); // Slightly behind bucket front
      p.stroke(0, 100, 255, this.bound_box_opacity); // Blue
      p.strokeWeight(3);
      p.fill(0, 100, 255, 50); // Semi-transparent blue fill
      p.rect(0, grabZoneOffsetY, grabZoneWidth, grabZoneHeight, this.Bucket_Top_Radius);

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