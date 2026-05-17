import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { EnvironmentComponent } from '../../../environment/environment';
import { WindowSizeService } from '../../services/window-size';
import { App } from '../../app';
import { CollidableObject, CollisionShape } from '../collidable-object/collidable-object';
import { Subscription } from 'rxjs';
import { ZoneDisplay } from '../zone_display/zone-display';
import p5 from 'p5';
import { ResetTrigger } from '../../services/reset-trigger';

@Component({
  selector: 'app-obstacle-field',
  imports: [],
  templateUrl: './obstacle-field.html',
  styleUrl: './obstacle-field.css',
})
export class ObstacleField implements OnInit, OnDestroy {
  environment = inject(EnvironmentComponent);
  windowSizeService = inject(WindowSizeService);
  app = inject(App);
  resetTrigger = inject(ResetTrigger);

  private windowSizeSubscription!: Subscription;
  private resetSubscription!: Subscription;

  // Collidable objects (obstacles) in the environment
  public collidableObjects: CollidableObject[] = [];

  // Obstacle generation settings
  public numRocks: number = 7;
  public numCraters: number = 4;
  public rockMinRadius: number = 0.075; // OCTANE terrain_collection_env_cfg: 0.15–0.60m diameter
  public rockMaxRadius: number = 0.30;
  public craterMinRadius: number = 0.20; // OCTANE terrain_collection_env_cfg: 0.40–1.50m diameter
  public craterMaxRadius: number = 0.75;
  get minSpacing(): number { return this.environment.rover_width_meters; }

  ngOnInit() {
    // Initialize obstacles
    this.generateObstacles();

    // Subscribe to window size changes (if needed for future updates)
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {
      // Currently obstacles don't need to regenerate on resize
      // But subscription is here if needed in the future
    });

    // Subscribe to reset trigger to regenerate obstacles on collision
    this.resetSubscription = this.resetTrigger.reset$.subscribe(() => {
      this.generateObstacles();
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

  // Generate random rocks and craters in excavation and obstacle zones
  private generateObstacles() {
    this.collidableObjects = [];
    const maxAttempts = 100; // Max attempts per obstacle to find valid position

    // Generate rocks
    for (let i = 0; i < this.numRocks; i++) {
      const radius = this.app.randomInRange(this.rockMinRadius, this.rockMaxRadius);
      const position = this.findValidPosition(radius, maxAttempts);

      if (position) {
        const rock = new CollidableObject({
          x_meters: position.x,
          y_meters: position.y,
          shape: CollisionShape.CIRCLE,
          radius_meters: radius,
          color: '#6b6b6b',
          name: `Rock_${i}`
        });
        this.collidableObjects.push(rock);
      }
    }

    // Generate craters
    for (let i = 0; i < this.numCraters; i++) {
      const radius = this.app.randomInRange(this.craterMinRadius, this.craterMaxRadius);
      const position = this.findValidPosition(radius, maxAttempts);

      if (position) {
        const crater = new CollidableObject({
          x_meters: position.x,
          y_meters: position.y,
          shape: CollisionShape.CIRCLE,
          radius_meters: radius,
          color: '#141414',
          name: `Crater_${i}`
        });
        this.collidableObjects.push(crater);
      }
    }

    // Arena boundary walls — thin panels at arena edge, also provided as AI sensor inputs
    const t  = this.environment.wallPanel_meters;
    const ew = this.environment.environment_width_meters;
    const eh = this.environment.environment_height_meters;
    [
      { name: 'Wall_N', x: ew / 2,     y: eh + t / 2, w: ew, h: t },
      { name: 'Wall_S', x: ew / 2,     y: -t / 2,     w: ew, h: t },
      { name: 'Wall_W', x: -t / 2,     y: eh / 2,     w: t,  h: eh },
      { name: 'Wall_E', x: ew + t / 2, y: eh / 2,     w: t,  h: eh },
    ].forEach(b => this.collidableObjects.push(new CollidableObject({
      x_meters: b.x, y_meters: b.y,
      shape: CollisionShape.RECTANGLE,
      width_meters: b.w, height_meters: b.h,
      color: '#d22828', name: b.name,
    })));

  }

  // Find position for an obstacle (no overlap with existing) within excavation or obstacle zones
  private findValidPosition(radius: number, maxAttempts: number): { x: number, y: number } | null {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generate random position in environment
      const x = this.app.randomInRange(radius, this.environment.environment_width_meters - radius);
      const y = this.app.randomInRange(radius, this.environment.environment_height_meters - radius);

      // Check if position is in allowed zones
      if (!this.isInAllowedZone(x, y)) {
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

  private isInAllowedZone(x: number, y: number): boolean {
    const al = this.environment.zoneDisplay?.arenaLayout;
    if (!al) return true;

    const inRect = (px: number, py: number, z: { x: number; y: number; w: number; h: number }, pad = 0.3) =>
      px >= z.x - pad && px <= z.x + z.w + pad &&
      py >= z.y - pad && py <= z.y + z.h + pad;

    if (inRect(x, y, al.start)) return false;
    if (inRect(x, y, al.deposit)) return false;
    if (inRect(x, y, al.berm, 0.5)) return false;
    if (al.column && inRect(x, y, al.column, 0.5)) return false;
    return true;
  }

  // Check if a position overlaps with existing collidable objects
  private hasOverlap(x: number, y: number, radius: number): boolean {
    for (const obj of this.collidableObjects) {
      const dx = x - obj.x_meters;
      const dy = y - obj.y_meters;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Calculate required minimum distance (sum of radii + minimum spacing)
      let minDistance: number;
      if (obj.isCircular() && obj.radius_meters) {
        minDistance = radius + obj.radius_meters + this.minSpacing;
      } else {
        continue;
      }

      if (distance < minDistance) {
        return true; // Overlap detected
      }
    }

    return false; // No overlap
  }

  update(p: p5) {
  }

  draw(p: p5) {
    for (const obj of this.collidableObjects) {
      const color = obj.color || '#000000';
      const rgb = this.app.hexToRgb(color) ?? { r: 0, g: 0, b: 0 };
      const x_px = this.environment.metersToPixels(obj.x_meters);
      const y_px = this.environment.environment_height_px - this.environment.metersToPixels(obj.y_meters);

      p.push();
      p.stroke(rgb.r, rgb.g, rgb.b, 255);
      p.strokeWeight(2);

      if (obj.isCircular() && obj.radius_meters) {
        const r_px = this.environment.metersToPixels(obj.radius_meters);
        p.fill(rgb.r, rgb.g, rgb.b, 255);
        p.circle(x_px, y_px, r_px * 2);
      } else if (obj.isRectangular() && obj.width_meters && obj.height_meters) {
        const w_px = this.environment.metersToPixels(obj.width_meters);
        const h_px = this.environment.metersToPixels(obj.height_meters);
        p.fill(rgb.r, rgb.g, rgb.b, 220);
        p.rect(x_px - w_px / 2, y_px - h_px / 2, w_px, h_px, 3);
      }

      p.pop();
    }
  }
}
