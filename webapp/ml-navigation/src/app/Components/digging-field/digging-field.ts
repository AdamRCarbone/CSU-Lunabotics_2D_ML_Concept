import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { EnvironmentComponent } from '../../../environment/environment';
import { WindowSizeService } from '../../services/window-size';
import { App } from '../../app';
import { Subscription } from 'rxjs';
import p5 from 'p5';
import { ResetTrigger } from '../../services/reset-trigger';
import { ZoneDisplay } from '../zone_display/zone-display';
import { ObstacleField } from '../obstacle_field/obstacle-field';

export class DiggableObject {
  x_meters: number;
  y_meters: number;
  radius_meters: number;
  color: string;
  name: string;

  constructor(config: {
    x_meters: number;
    y_meters: number;
    radius_meters: number;
    color: string;
    name: string;
  }) {
    this.x_meters = config.x_meters;
    this.y_meters = config.y_meters;
    this.radius_meters = config.radius_meters;
    this.color = config.color;
    this.name = config.name;
  }
}

@Component({
  selector: 'app-digging-field',
  imports: [],
  templateUrl: './digging-field.html',
  styleUrl: './digging-field.css',
})
export class DiggingField implements OnInit, OnDestroy {
  environment = inject(EnvironmentComponent);
  windowSizeService = inject(WindowSizeService);
  app = inject(App);
  resetTrigger = inject(ResetTrigger);

  private windowSizeSubscription!: Subscription;
  private resetSubscription!: Subscription;

  // Diggable objects (regolith orbs) in the environment
  public diggableObjects: DiggableObject[] = [];

  // Digging field generation settings
  public numOrbs: number = 15;          // Number of regolith orbs to generate
  public orbRadius: number = 0.075;      // Fixed radius for all orbs (0.15m diameter)
  public minSpacing: number = 0.2;       // Min spacing between orbs (meters)

  ngOnInit() {
    // Initialize diggable objects
    this.generateDiggables();

    // Subscribe to window size changes (if needed for future updates)
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(() => {
      // Currently diggables don't need to regenerate on resize
      // But subscription is here if needed in the future
    });

    // Subscribe to reset trigger to regenerate diggables on collision
    this.resetSubscription = this.resetTrigger.reset$.subscribe(() => {
      this.generateDiggables();
    });
  }

  ngOnDestroy() {
    if (this.windowSizeSubscription) {
      this.windowSizeSubscription.unsubscribe();
    }
    if (this.resetSubscription) {
      this.resetSubscription.unsubscribe();
    }
  }

  // Generate random regolith orbs in excavation zone (and starting zone)
  private generateDiggables() {
    this.diggableObjects = [];
    const maxAttempts = 100; // Max attempts per orb to find valid position

    // Generate regolith orbs
    for (let i = 0; i < this.numOrbs; i++) {
      const position = this.findValidPosition(this.orbRadius, maxAttempts);

      if (position) {
        const orb = new DiggableObject({
          x_meters: position.x,
          y_meters: position.y,
          radius_meters: this.orbRadius,
          color: '#8B4513', // Brown color
          name: `Regolith_${i}`
        });
        this.diggableObjects.push(orb);
      }
    }
  }

  // Find position for a diggable orb (no overlap with existing) within excavation zone
  private findValidPosition(radius: number, maxAttempts: number): { x: number, y: number } | null {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generate random position in environment
      const x = this.app.randomInRange(radius, this.environment.environment_width_meters - radius);
      const y = this.app.randomInRange(radius, this.environment.environment_height_meters - radius);

      // Check if position is in excavation zone
      if (!this.isInExcavationZone(x, y)) {
        continue;
      }

      // Check if position overlaps with existing objects
      if (this.hasOverlap(x, y, radius)) {
        continue;
      }

      return { x, y };
    }

    return null; // Failed to find valid position
  }

  // Check if position is in excavation zone (left side, uses zone-display dimensions)
  private isInExcavationZone(x: number, y: number): boolean {
    const zoneDisplay = this.environment.zoneDisplay;
    if (!zoneDisplay) return false;

    // Excavation zone is the left side of the environment
    return x <= zoneDisplay.excavationZone_width_meters;
  }

  // Check if a position overlaps with existing diggable objects or obstacles
  private hasOverlap(x: number, y: number, radius: number): boolean {
    // Check overlap with existing diggable objects
    for (const obj of this.diggableObjects) {
      const dx = x - obj.x_meters;
      const dy = y - obj.y_meters;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Calculate required minimum distance (sum of radii + minimum spacing)
      const minDistance = radius + obj.radius_meters + this.minSpacing;

      if (distance < minDistance) {
        return true; // Overlap detected
      }
    }

    // Check overlap with obstacle field objects (rocks, craters)
    const obstacleField = this.environment.obstacleField;
    if (obstacleField) {
      for (const obstacle of obstacleField.collidableObjects) {
        const dx = x - obstacle.x_meters;
        const dy = y - obstacle.y_meters;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Calculate required minimum distance
        let obstacleRadius: number;
        if (obstacle.isCircular() && obstacle.radius_meters) {
          obstacleRadius = obstacle.radius_meters;
        } else if (obstacle.width_meters && obstacle.height_meters) {
          obstacleRadius = Math.sqrt(obstacle.width_meters ** 2 + obstacle.height_meters ** 2) / 2;
        } else {
          continue;
        }

        const minDistance = radius + obstacleRadius + this.minSpacing;

        if (distance < minDistance) {
          return true; // Overlap with obstacle detected
        }
      }
    }

    // Check overlap with zone display objects (column post)
    const zoneDisplay = this.environment.zoneDisplay;
    if (zoneDisplay) {
      for (const zoneObj of zoneDisplay.collidableObjects) {
        const dx = x - zoneObj.x_meters;
        const dy = y - zoneObj.y_meters;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Calculate required minimum distance for zone objects
        let zoneObjRadius: number;
        if (zoneObj.isCircular() && zoneObj.radius_meters) {
          zoneObjRadius = zoneObj.radius_meters;
        } else if (zoneObj.width_meters && zoneObj.height_meters) {
          zoneObjRadius = Math.sqrt(zoneObj.width_meters ** 2 + zoneObj.height_meters ** 2) / 2;
        } else {
          continue;
        }

        const minDistance = radius + zoneObjRadius + this.minSpacing;

        if (distance < minDistance) {
          return true; // Overlap with zone object detected
        }
      }
    }

    return false; // No overlap
  }

  update() {
  }

  draw(p: p5) {
    // Draw all regolith orbs
    for (const obj of this.diggableObjects) {
      const color = obj.color || '#8B4513';
      const rgb = this.app.hexToRgb(color) ?? { r: 139, g: 69, b: 19 };

      // Convert meters to pixels
      const x_px = this.environment.metersToPixels(obj.x_meters);
      const y_px = this.environment.environment_height_px - this.environment.metersToPixels(obj.y_meters); // Flip Y
      const radius_px = this.environment.metersToPixels(obj.radius_meters);

      // Draw circle
      p.push();
      p.stroke(rgb.r, rgb.g, rgb.b, 255);
      p.fill(rgb.r, rgb.g, rgb.b, 255);
      p.strokeWeight(2);
      p.circle(x_px, y_px, radius_px * 2); // p5.js circle uses diameter
      p.pop();
    }
  }
}
