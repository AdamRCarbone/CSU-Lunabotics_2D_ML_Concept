// src/app/Components/rover/rover.ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { WindowSizeService } from '../../services/window-size';
import { Subscription } from 'rxjs';
import { EnvironmentComponent } from '../../../environment/environment';
import { App } from '../../app';
import { ResetTrigger } from '../../services/reset-trigger';
import { Body } from 'matter-js';
import * as THREE from 'three';
import { SceneManager } from '../../three/scene-manager';

@Component({
  selector: 'app-rover',
  standalone: true,
  template: '', // rendering handled by Three.js
  styleUrls: ['./rover.css']
})
export class RoverComponent implements OnInit, OnDestroy {
  private windowSizeSubscription!: Subscription;
  private resetSubscription!: Subscription;
  private physicsBody!: Body;
  private roverMesh!: THREE.Group;
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
  public turnSpeed: number = .25; // Degrees per frame
  private pressedKeys = new Set<string>();
  private speedThreshold: number = 0.1;

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
    if (!this.physicsBody) return 0;
    const angleDegrees = this.physicsBody.angle * 180 / Math.PI;
    // Round to nearest turnSpeed increment
    return Math.round(angleDegrees / this.turnSpeed) * this.turnSpeed;
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

    // Reset speed and target
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

  // Set the Three.js mesh for this rover
  setThreeMesh(mesh: THREE.Group) {
    this.roverMesh = mesh;
    this.updateBoundingBoxVisibility();
  }

  // Update bounding box visibility
  private updateBoundingBoxVisibility() {
    if (!this.roverMesh) return;

    // Find bounding box in the mesh
    this.roverMesh.children.forEach(child => {
      if (child.name === 'boundingBox') {
        child.visible = this.showBoundingBox;
        if (child instanceof THREE.LineLoop) {
          const material = child.material as THREE.LineBasicMaterial;
          material.opacity = this.bound_box_opacity / 255;
        }
      }
    });
  }

  // Update Three.js rendering (called from animation loop)
  updateThree() {
    if (!this.physicsBody) return;

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
  }

  keyPressed(event: KeyboardEvent) {
    this.pressedKeys.add(event.key.toLowerCase());
  }

  keyReleased(event: KeyboardEvent) {
    this.pressedKeys.delete(event.key.toLowerCase());
  }
}