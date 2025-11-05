import { Component, inject, OnInit } from '@angular/core';
import { EnvironmentComponent } from '../../../environment/environment';
import { CollidableObject } from '../collidable-object/collidable-object';
import p5 from 'p5';

// Interface for objects that can be detected (prepares for diggable objects)
export interface DetectableObject {
  x_meters: number;
  y_meters: number;
  radius_meters?: number;
  width_meters?: number;
  height_meters?: number;
  name?: string;
}

@Component({
  selector: 'app-frustum',
  imports: [],
  templateUrl: './frustum.html',
  styleUrl: './frustum.css',
})
export class Frustum implements OnInit {
  environment = inject(EnvironmentComponent);

  // Frustum properties (configurable)
  public depth: number = 1.75; // Depth of frustum in meters
  public farWidth: number = 2; // Width at far end in meters
  public farRadius: number = 0.5; // Radius for rounded corners at far end in meters
  public color: string = '#8e4cff';
  public opacity: number = 50; // Opacity (0-255)

  // Detected objects
  public detectedCollidableObjects: CollidableObject[] = [];
  public detectedDiggableObjects: DetectableObject[] = []; // For future use

  ngOnInit() {
    // Component initialized
  }

  update(p: p5) {
    // Clear previous detections
    this.detectedCollidableObjects = [];
    this.detectedDiggableObjects = [];

    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return;

    // Get collidable objects from obstacle field and zone display
    const obstacleFieldObjects = this.environment.obstacleField?.collidableObjects || [];
    const zoneDisplayObjects = this.environment.zoneDisplay?.collidableObjects || [];
    const allCollidableObjects = [...obstacleFieldObjects, ...zoneDisplayObjects];

    // Detect objects within frustum
    for (const obj of allCollidableObjects) {
      if (this.isObjectInFrustum(obj, state.x, state.y, state.angle)) {
        this.detectedCollidableObjects.push(obj);
      }
    }

    // TODO: Add diggable objects detection when available
    // const diggableObjects = this.environment.diggableField?.diggableObjects || [];
    // for (const obj of diggableObjects) {
    //   if (this.isObjectInFrustum(obj, state.x, state.y, state.angle)) {
    //     this.detectedDiggableObjects.push(obj);
    //   }
    // }
  }

  // Check if an object is within the frustum area (using object bounds, not just center)
  private isObjectInFrustum(
    obj: DetectableObject,
    roverX: number,
    roverY: number,
    roverAngle: number
  ): boolean {
    // Convert object position from meters to pixels
    const objXPx = (obj.x_meters / this.environment.environment_width_meters) * this.environment.environment_width_px;
    const objYPx = this.environment.environment_height_px - ((obj.y_meters / this.environment.environment_height_meters) * this.environment.environment_height_px);

    // Get object radius in pixels
    let objectRadius = 0;
    if (obj.radius_meters) {
      objectRadius = this.environment.metersToPixels(obj.radius_meters);
    } else if (obj.width_meters && obj.height_meters) {
      // For rectangles, use approximate radius (half diagonal)
      const w = this.environment.metersToPixels(obj.width_meters);
      const h = this.environment.metersToPixels(obj.height_meters);
      objectRadius = Math.sqrt(w * w + h * h) / 2;
    }

    // Frustum dimensions in pixels
    const roverWidth = this.environment.rover.Rover_Width;
    const depthPx = this.environment.metersToPixels(this.depth);
    const farWidthPx = this.environment.metersToPixels(this.farWidth);

    // Rotate to rover's local space (inverse rotation)
    const angleRad = -(roverAngle * Math.PI / 180);

    // Test multiple points on object's boundary (not just center)
    // This ensures we detect if ANY part of the object is in the frustum
    const numTestPoints = 8;
    for (let i = 0; i < numTestPoints; i++) {
      const testAngle = (i / numTestPoints) * Math.PI * 2;
      const testX = objXPx + Math.cos(testAngle) * objectRadius;
      const testY = objYPx + Math.sin(testAngle) * objectRadius;

      // Transform test point to rover's local coordinate system
      const dx = testX - roverX;
      const dy = testY - roverY;
      const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
      const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

      // Check if test point is within frustum bounds
      // Frustum extends in negative Y direction (forward from rover)
      if (localY > 0 || localY < -depthPx) {
        continue; // This point is outside depth range
      }

      // Calculate width at this depth using linear interpolation
      const t = -localY / depthPx; // 0 at near edge, 1 at far edge
      const widthAtDepth = roverWidth + t * (farWidthPx - roverWidth);

      // Check if this point is within horizontal bounds
      if (Math.abs(localX) <= widthAtDepth / 2) {
        return true; // At least one point on the object is inside the frustum
      }
    }

    return false; // No points on the object are inside the frustum
  }

  draw(p: p5) {
    if (!this.environment.rover) return;

    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return;

    const { x, y, angle } = state;

    // Get rover width from rover component
    const roverWidth = this.environment.rover.Rover_Width;
    const nearWidth = roverWidth; // Frustum starts at rover width

    // Convert meters to pixels
    const depthPx = this.environment.metersToPixels(this.depth);
    const farWidthPx = this.environment.metersToPixels(this.farWidth);

    // Parse color
    const rgb = this.environment.app.hexToRgb(this.color) ?? { r: 0, g: 255, b: 0 };

    p.push();
    p.translate(x, y);
    p.rotate(angle);

    // Draw frustum shape (trapezoid with rounded far corners)
    p.fill(rgb.r, rgb.g, rgb.b, this.opacity);
    p.stroke(rgb.r, rgb.g, rgb.b, this.opacity * 2);
    p.strokeWeight(1);

    // Define frustum points (trapezoid)
    // Near edge (at rover position, along rover width)
    const nearLeft = { x: -nearWidth / 2, y: 0 };
    const nearRight = { x: nearWidth / 2, y: 0 };

    // Far edge (at depth distance)
    const farLeft = { x: -farWidthPx / 2, y: -depthPx };
    const farRight = { x: farWidthPx / 2, y: -depthPx };

    // Corner radius for far edge
    const cornerRadius = Math.min(farWidthPx * 0.075, depthPx * 0.05);

    // Draw the trapezoid with rounded far corners using path
    const ctx = (p as any).drawingContext as CanvasRenderingContext2D;
    ctx.beginPath();

    // Start at near left
    ctx.moveTo(nearLeft.x, nearLeft.y);
    ctx.lineTo(nearRight.x, nearRight.y);

    // Right edge to far corner
    ctx.lineTo(farRight.x, farRight.y + cornerRadius);

    // Rounded top-right corner
    ctx.arcTo(farRight.x, farRight.y, farRight.x - cornerRadius, farRight.y, cornerRadius);

    // Top edge
    ctx.lineTo(farLeft.x + cornerRadius, farLeft.y);

    // Rounded top-left corner
    ctx.arcTo(farLeft.x, farLeft.y, farLeft.x, farLeft.y + cornerRadius, cornerRadius);

    // Left edge back to start
    ctx.lineTo(farLeft.x, farLeft.y + cornerRadius);
    ctx.lineTo(nearLeft.x, nearLeft.y);

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    p.pop();
  }
}
