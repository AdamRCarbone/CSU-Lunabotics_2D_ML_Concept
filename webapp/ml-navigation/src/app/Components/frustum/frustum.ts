import { Component, inject } from '@angular/core';
import { EnvironmentComponent } from '../../../environment/environment';
import { CollidableObject } from '../collidable-object/collidable-object';
import p5 from 'p5';

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
export class Frustum {
  environment = inject(EnvironmentComponent);

  public detectionRadius: number = 2.0; // metres
  public color: string = '#8e4cff';
  public opacity: number = 35;

  public detectedCollidableObjects: CollidableObject[] = [];
  public detectedDiggableObjects: DetectableObject[] = [];

  draw(p: p5) {
    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return;

    this.detectedCollidableObjects = [];
    this.detectedDiggableObjects = [];

    const { x, y } = state;
    const radiusPx = this.environment.metersToPixels(this.detectionRadius);

    // Detect nearby collidable objects
    const allCollidable = [
      ...(this.environment.obstacleField?.collidableObjects || []),
      ...(this.environment.zoneDisplay?.collidableObjects   || []),
    ];
    for (const obj of allCollidable) {
      if (this.withinRadius(obj.x_meters, obj.y_meters, state, this.detectionRadius)) {
        this.detectedCollidableObjects.push(obj);
      }
    }

    // Detect nearby diggable orbs
    for (const obj of this.environment.diggingField?.diggableObjects || []) {
      if (this.withinRadius(obj.x_meters, obj.y_meters, state, this.detectionRadius)) {
        this.detectedDiggableObjects.push(obj);
      }
    }

    // Draw purple detection circle
    const rgb = this.environment.app.hexToRgb(this.color) ?? { r: 142, g: 76, b: 255 };
    p.push();
    p.stroke(rgb.r, rgb.g, rgb.b, this.opacity * 3);
    p.strokeWeight(1.5);
    p.fill(rgb.r, rgb.g, rgb.b, this.opacity);
    p.circle(x, y, radiusPx * 2);
    p.pop();
  }

  private withinRadius(
    objX: number, objY: number,
    state: { x: number; y: number },
    radiusM: number
  ): boolean {
    const objXPx = this.environment.metersToPixels(objX);
    const objYPx = this.environment.environment_height_px - this.environment.metersToPixels(objY);
    return Math.hypot(objXPx - state.x, objYPx - state.y) <= this.environment.metersToPixels(radiusM);
  }
}
