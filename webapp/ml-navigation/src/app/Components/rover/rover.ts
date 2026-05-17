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
  template: '',
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
  BoundingBox_Left!: number;
  BoundingBox_Right!: number;
  BoundingBox_Top!: number;
  BoundingBox_Bottom!: number;
  BoundingBox_OffsetX!: number;
  BoundingBox_OffsetY!: number;
  public showBoundingBox: boolean = false;

  // Differential drive state
  private _leftMotor: number = 0;   // actual applied value
  private _rightMotor: number = 0;
  private _leftTarget: number = 0;  // commanded from slider
  private _rightTarget: number = 0;
  private pressedKeys = new Set<string>();

  // Physics properties — speed computed from real m/s units
  private readonly nominalSpeedMs: number = 0.2;
  private readonly trackWidthM: number = 0.5; // wheel-center to wheel-center
  public turnSpeed: number = .25; // used by environment for spawn rotation

  private get maxSpeed(): number {
    const pxPerM = this.environment.environment_height_px / this.environment.environment_height_meters;
    return this.nominalSpeedMs * (this.app.speedMultiplierPercent / 100) * pxPerM / 60;
  }

  private get maxAngularSpeed(): number {
    return this.nominalSpeedMs * (this.app.speedMultiplierPercent / 100) / (this.trackWidthM * 60);
  }

  // Zone tracking
  public currentZone: Zone = Zone.NONE;

  set leftMotor(value: number) {
    this._leftTarget = value;
  }
  get leftMotor(): number {
    return this._leftMotor;
  }

  set rightMotor(value: number) {
    this._rightTarget = value;
  }
  get rightMotor(): number {
    return this._rightMotor;
  }

  constructor(private windowSizeService: WindowSizeService) {
    const { width, height } = this.windowSizeService.windowSizeSubject.getValue();
    this.updateProperties(height);
  }

  private clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  private updateProperties(windowHeight: number) {
    this.window_width = this.environment.environment_width_px;
    this.window_height = this.environment.environment_height_px;
    this.cell = this.window_height / this.grid_size;

    this.Rover_Height = this.environment.metersToPixels(this.environment.rover_length_meters);
    this.Rover_Width = this.environment.metersToPixels(this.environment.rover_width_meters);

    const heightScale = this.Rover_Height / 5;
    this.Rover_Stroke_Thickness = 0.25 * heightScale;
    this.Rover_Radius = 0.5 * heightScale;
    this.Rover_Origin_X = this.Rover_Width / 2;
    this.Rover_Origin_Y = this.Rover_Height / 2;

    this.Wheel_Width = this.Rover_Width / 4;
    this.Wheel_Height = this.Rover_Height / 4;
    this.Wheel_Left_X = -(3 / 4) * this.Rover_Width;
    this.Wheel_Right_X = (1 / 2) * this.Rover_Width;
    this.Wheel_Front_Y = -this.Rover_Height / 2;
    this.Wheel_Middle_Y = -this.Rover_Height / 8;
    this.Wheel_Back_Y = this.Rover_Height / 4;

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

    this.calculateBoundingBox();
  }

  private calculateBoundingBox() {
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
    const startX = this.environment.rover_start_x_px;
    const startY = this.environment.rover_start_y_px;
    const rotation = this.environment.rover_start_rotation;

    const boundingWidth = this.BoundingBox_Left + this.BoundingBox_Right;
    const boundingHeight = this.BoundingBox_Top + this.BoundingBox_Bottom;

    this.physicsBody = this.environment.physicsEngine.createRover(
      startX, startY, boundingWidth, boundingHeight, rotation,
      0, 0
    );

    this.environment.physicsEngine.createBoundaries(
      this.environment.environment_width_px,
      this.environment.environment_height_px
    );

    this.setupPhysicsObstacles();

    this.environment.physicsEngine.setCollisionCallback(() => {
      this.ResetTrigger.triggerReset();
    });

    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {
      this.updateProperties(height);
    });

    this.resetSubscription = this.ResetTrigger.reset$.subscribe(() => {
      this.resetRoverPosition();
    });
  }

  private setupPhysicsObstacles() {
    setTimeout(() => {
      this.environment.physicsEngine.clearObstacles();

      const obstacles = this.environment.obstacleField?.collidableObjects || [];

      obstacles.forEach(obstacle => {
        const x = (obstacle.x_meters / this.environment.environment_width_meters) * this.environment.environment_width_px;
        const y = this.environment.environment_height_px - ((obstacle.y_meters / this.environment.environment_height_meters) * this.environment.environment_height_px);

        if (obstacle.isCircular() && obstacle.radius_meters) {
          const radius = this.environment.metersToPixels(obstacle.radius_meters);
          const label = obstacle.name?.toLowerCase().includes('crater') ? 'crater'
                      : obstacle.name?.toLowerCase().includes('rock')   ? 'rock' : 'obstacle';
          this.environment.physicsEngine.addObstacle(x, y, radius, label);
        } else if (obstacle.isRectangular() && obstacle.width_meters && obstacle.height_meters) {
          const w = this.environment.metersToPixels(obstacle.width_meters);
          const h = this.environment.metersToPixels(obstacle.height_meters);
          this.environment.physicsEngine.addRectangleObstacle(x, y, w, h, 'wall');
        }
      });

      const zoneObjects = this.environment.zoneDisplay?.collidableObjects || [];
      zoneObjects.forEach(obj => {
        if (obj.isRectangular() && obj.width_meters && obj.height_meters) {
          const x = (obj.x_meters / this.environment.environment_width_meters) * this.environment.environment_width_px;
          const y = this.environment.environment_height_px - ((obj.y_meters / this.environment.environment_height_meters) * this.environment.environment_height_px);
          const w = this.environment.metersToPixels(obj.width_meters);
          const h = this.environment.metersToPixels(obj.height_meters);
          this.environment.physicsEngine.addRectangleObstacle(x, y, w, h, 'column');
        }
      });
    }, 200);
  }

  private resetRoverPosition() {
    this.environment.randomizeRoverSpawn();
    this.environment.physicsEngine.resetRover(
      this.environment.rover_start_x_px,
      this.environment.rover_start_y_px,
      this.environment.rover_start_rotation
    );
    this.setupPhysicsObstacles();
    this._leftMotor = 0;
    this._rightMotor = 0;
    this._leftTarget = 0;
    this._rightTarget = 0;
  }

  ngOnDestroy() {
    if (this.windowSizeSubscription) this.windowSizeSubscription.unsubscribe();
    if (this.resetSubscription) this.resetSubscription.unsubscribe();
  }

  update(p: p5) {
    const hasW = this.pressedKeys.has('w');
    const hasS = this.pressedKeys.has('s');
    const hasA = this.pressedKeys.has('a');
    const hasD = this.pressedKeys.has('d');
    const hasKey = hasW || hasS || hasA || hasD;

    if (hasKey) {
      if (hasW || hasS) {
        const dir = hasW ? 1 : -1;
        if (hasA && !hasD) {
          this._leftMotor = dir * 0.4;
          this._rightMotor = dir * 1.0;
        } else if (hasD && !hasA) {
          this._leftMotor = dir * 1.0;
          this._rightMotor = dir * 0.4;
        } else {
          this._leftMotor = dir;
          this._rightMotor = dir;
        }
      } else if (hasA) {
        this._leftMotor = -0.7;
        this._rightMotor = 0.7;
      } else if (hasD) {
        this._leftMotor = 0.7;
        this._rightMotor = -0.7;
      }
    } else {
      this._leftMotor = this._leftTarget;
      this._rightMotor = this._rightTarget;
    }

    const angle = this.physicsBody.angle;
    const v     = (this._leftMotor + this._rightMotor) / 2 * this.maxSpeed;
    const omega = (this._leftMotor - this._rightMotor) * this.maxAngularSpeed;

    const vx = Math.sin(angle) * v;
    const vy = -Math.cos(angle) * v;
    this.environment.physicsEngine.setRoverVelocity(vx, vy);
    this.environment.physicsEngine.setRoverAngularVelocity(omega);
  }

  draw(p: p5) {
    if (!this.physicsBody) return;

    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return;

    const { x, y, angle } = state;

    p.push();
    p.translate(x, y);
    p.rotate(angle);

    // Body
    p.fill(100, 100, 100);
    p.strokeWeight(this.Rover_Stroke_Thickness);
    p.stroke(this.Rover_Stroke_Color);
    p.rect(-this.Rover_Width / 2, -this.Rover_Height / 2, this.Rover_Width, this.Rover_Height, this.Rover_Radius);

    // Left motor indicator stripe
    const leftIntensity = Math.abs(this._leftMotor);
    const leftForward = this._leftMotor >= 0;
    p.fill(leftForward ? 0 : 200, leftForward ? Math.floor(160 * leftIntensity) : 0, 0, Math.floor(200 * leftIntensity + 55));
    p.noStroke();
    p.rect(this.Wheel_Left_X - 2, this.Wheel_Front_Y, this.Wheel_Width + 4, this.Rover_Height * 0.8, 2);

    // Right motor indicator stripe
    const rightIntensity = Math.abs(this._rightMotor);
    const rightForward = this._rightMotor >= 0;
    p.fill(rightForward ? 0 : 200, rightForward ? Math.floor(160 * rightIntensity) : 0, 0, Math.floor(200 * rightIntensity + 55));
    p.noStroke();
    p.rect(this.Wheel_Right_X - 2, this.Wheel_Front_Y, this.Wheel_Width + 4, this.Rover_Height * 0.8, 2);

    // Wheels
    p.fill(25, 25, 25);
    p.strokeWeight(this.Rover_Stroke_Thickness);
    p.stroke(this.Rover_Stroke_Color);
    p.rect(this.Wheel_Left_X, this.Wheel_Front_Y,  this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(this.Wheel_Left_X, this.Wheel_Middle_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(this.Wheel_Left_X, this.Wheel_Back_Y,   this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(this.Wheel_Right_X, this.Wheel_Front_Y,  this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(this.Wheel_Right_X, this.Wheel_Middle_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    p.rect(this.Wheel_Right_X, this.Wheel_Back_Y,   this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);

    // Digging bucket
    p.fill(150, 150, 150);
    p.strokeWeight(this.Rover_Stroke_Thickness);
    p.stroke(this.Rover_Stroke_Color);
    p.rect(this.Bucket_Arm_Left_X,  this.Bucket_Arm_Y, this.Bucket_Arm_Width, this.Bucket_Arm_Height, this.Rover_Radius);
    p.rect(this.Bucket_Arm_Right_X, this.Bucket_Arm_Y, this.Bucket_Arm_Width, this.Bucket_Arm_Height, this.Rover_Radius);
    p.rect(this.Bucket_X, this.Bucket_Y, this.Bucket_Width, this.Bucket_Height,
           this.Bucket_Top_Radius, this.Bucket_Top_Radius, this.Bucket_Bottom_Radius, this.Bucket_Bottom_Radius);

    if (this.showBoundingBox) {
      p.stroke(255, 0, 0, 180);
      p.strokeWeight(2);
      p.noFill();
      p.rectMode(p.CENTER);
      const bw = this.BoundingBox_Left + this.BoundingBox_Right;
      const bh = this.BoundingBox_Top + this.BoundingBox_Bottom;
      p.rect(this.BoundingBox_OffsetX, this.BoundingBox_OffsetY, bw, bh, this.Bucket_Top_Radius * 2);
      p.rectMode(p.CORNER);
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
