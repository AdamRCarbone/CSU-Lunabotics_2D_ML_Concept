import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { EnvironmentComponent } from '../../../environment/environment';
import { WindowSizeService } from '../../services/window-size';
import { App } from '../../app';
import { Subscription } from 'rxjs';
import p5 from 'p5';
import { ResetTrigger } from '../../services/reset-trigger';
import { ZoneDisplay } from '../zone_display/zone-display';
import { ObstacleField } from '../obstacle_field/obstacle-field';
import { Body } from 'matter-js';

export class DiggableObject {
  x_meters: number;
  y_meters: number;
  radius_meters: number;
  color: string;
  name: string;
  physicsBody?: Body; // Add physics body reference
  isPickedUp: boolean = false; // Track if orb is picked up by rover
  pickupOffsetX: number = 0; // Offset from rover center when picked up
  pickupOffsetY: number = 0; // Offset from rover center when picked up

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
  public digModeEnabled: boolean = false; // Whether dig mode is active

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
    // Clear existing physics bodies
    if (this.environment.physicsEngine) {
      this.environment.physicsEngine.clearDiggables();
    }

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

        // Create physics body for the orb (convert meters to pixels)
        if (this.environment.physicsEngine) {
          const x_px = this.environment.metersToPixels(position.x);
          const y_px = this.environment.environment_height_px - this.environment.metersToPixels(position.y);
          const radius_px = this.environment.metersToPixels(this.orbRadius);

          orb.physicsBody = this.environment.physicsEngine.addDiggable(
            x_px,
            y_px,
            radius_px,
            `Regolith_${i}`
          );
        }

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
    // Update position of picked-up orbs to follow rover
    this.updatePickedUpOrbs();
  }

  // Check if any orbs are in the front 1/10 grab zone
  // Returns true if at least one orb is in the zone
  public canGrab(): boolean {
    if (!this.environment.rover || !this.environment.physicsEngine) return false;

    const roverState = this.environment.physicsEngine.getRoverState();
    if (!roverState) return false;

    const roverX_px = roverState.x;
    const roverY_px = roverState.y;
    const roverAngle_rad = roverState.angle * Math.PI / 180;

    // Get rover bucket position (front of rover)
    const boundingBoxHeight_px = this.environment.rover.BoundingBox_Top + this.environment.rover.BoundingBox_Bottom;
    const bucketY_local = this.environment.rover.Bucket_Y; // Bucket Y in local coords (negative = front)
    const bucketHeight_px = this.environment.rover.Bucket_Height;
    const bucketWidth_px = this.environment.rover.Bucket_Width;

    // Define grab zone
    const grabZoneHeight_px = boundingBoxHeight_px * 0.2; // 20% of bounding box height
    const grabZoneWidth_px = bucketWidth_px; // Bucket width

    // Calculate grab zone center position - moved back slightly from bucket front
    const grabZoneDistance_px = bucketY_local + (bucketHeight_px * 0.2); // Slightly behind bucket front
    const grabZoneX_px = roverX_px - Math.sin(roverAngle_rad) * grabZoneDistance_px;
    const grabZoneY_px = roverY_px + Math.cos(roverAngle_rad) * grabZoneDistance_px;

    console.log(`Grab zone at (${grabZoneX_px.toFixed(1)}, ${grabZoneY_px.toFixed(1)}), size ${grabZoneWidth_px.toFixed(1)}x${grabZoneHeight_px.toFixed(1)}`);
    console.log(`Rover at (${roverX_px.toFixed(1)}, ${roverY_px.toFixed(1)}), angle ${roverState.angle.toFixed(1)}°`);

    // Check each orb
    let checkedCount = 0;
    for (const orb of this.diggableObjects) {
      if (orb.isPickedUp) continue; // Skip already picked up orbs

      // Get orb position in pixels
      const orbX_px = this.environment.metersToPixels(orb.x_meters);
      const orbY_px = this.environment.environment_height_px - this.environment.metersToPixels(orb.y_meters);

      // Calculate orb position relative to grab zone center
      const dx_px = orbX_px - grabZoneX_px;
      const dy_px = orbY_px - grabZoneY_px;

      // Rotate to rover's local coordinate system
      const localX_px = dx_px * Math.cos(-roverAngle_rad) - dy_px * Math.sin(-roverAngle_rad);
      const localY_px = dx_px * Math.sin(-roverAngle_rad) + dy_px * Math.cos(-roverAngle_rad);

      checkedCount++;
      if (checkedCount <= 3) {
        console.log(`  Orb ${orb.name} at (${orbX_px.toFixed(1)}, ${orbY_px.toFixed(1)}) -> local (${localX_px.toFixed(1)}, ${localY_px.toFixed(1)})`);
      }

      // Check if orb is within grab zone
      if (Math.abs(localX_px) <= grabZoneWidth_px / 2 &&
          Math.abs(localY_px) <= grabZoneHeight_px / 2) {
        console.log(`  ✓ Orb ${orb.name} IS IN GRAB ZONE!`);
        return true; // At least one orb is in grab zone
      }
    }

    console.log(`  Checked ${checkedCount} orbs, none in grab zone`);
    return false; // No orbs in grab zone
  }

  // Grab all orbs in the front 1/10 zone
  public grabOrbs() {
    if (!this.environment.rover || !this.environment.physicsEngine) return;

    const roverState = this.environment.physicsEngine.getRoverState();
    if (!roverState) return;

    const roverX_px = roverState.x;
    const roverY_px = roverState.y;
    const roverAngle_rad = roverState.angle * Math.PI / 180;

    // Get rover bucket position (front of rover)
    const boundingBoxHeight_px = this.environment.rover.BoundingBox_Top + this.environment.rover.BoundingBox_Bottom;
    const bucketY_local = this.environment.rover.Bucket_Y; // Bucket Y in local coords (negative = front)
    const bucketHeight_px = this.environment.rover.Bucket_Height;
    const bucketWidth_px = this.environment.rover.Bucket_Width;

    // Define grab zone
    const grabZoneHeight_px = boundingBoxHeight_px * 0.2; // 20% of bounding box height
    const grabZoneWidth_px = bucketWidth_px; // Bucket width

    // Calculate grab zone center position - moved back slightly from bucket front
    const grabZoneDistance_px = bucketY_local + (bucketHeight_px * 0.2); // Slightly behind bucket front
    const grabZoneX_px = roverX_px - Math.sin(roverAngle_rad) * grabZoneDistance_px;
    const grabZoneY_px = roverY_px + Math.cos(roverAngle_rad) * grabZoneDistance_px;

    // Grab all orbs in the zone
    for (const orb of this.diggableObjects) {
      if (orb.isPickedUp) continue;

      // Get orb position in pixels
      const orbX_px = this.environment.metersToPixels(orb.x_meters);
      const orbY_px = this.environment.environment_height_px - this.environment.metersToPixels(orb.y_meters);

      // Calculate orb position relative to grab zone center
      const dx_px = orbX_px - grabZoneX_px;
      const dy_px = orbY_px - grabZoneY_px;

      // Rotate to rover's local coordinate system
      const localX_px = dx_px * Math.cos(-roverAngle_rad) - dy_px * Math.sin(-roverAngle_rad);
      const localY_px = dx_px * Math.sin(-roverAngle_rad) + dy_px * Math.cos(-roverAngle_rad);

      // Check if orb is within grab zone
      if (Math.abs(localX_px) <= grabZoneWidth_px / 2 &&
          Math.abs(localY_px) <= grabZoneHeight_px / 2) {
        // Grab the orb!
        orb.isPickedUp = true;

        // Store offset from rover center in ROVER'S LOCAL coordinate system
        const dx_px = orbX_px - roverX_px;
        const dy_px = orbY_px - roverY_px;
        // Rotate to rover's local coordinates (inverse of current rotation)
        orb.pickupOffsetX = dx_px * Math.cos(-roverAngle_rad) - dy_px * Math.sin(-roverAngle_rad);
        orb.pickupOffsetY = dx_px * Math.sin(-roverAngle_rad) + dy_px * Math.cos(-roverAngle_rad);

        console.log(`Grabbed orb: ${orb.name} at local offset (${orb.pickupOffsetX.toFixed(1)}, ${orb.pickupOffsetY.toFixed(1)})`);
      }
    }
  }

  // Update position of picked-up orbs to follow rover
  private updatePickedUpOrbs() {
    if (!this.environment.physicsEngine) return;

    const roverState = this.environment.physicsEngine.getRoverState();
    if (!roverState) return;

    const roverX_px = roverState.x;
    const roverY_px = roverState.y;
    const roverAngle_rad = roverState.angle * Math.PI / 180;

    for (const orb of this.diggableObjects) {
      if (!orb.isPickedUp) continue;

      // Rotate offset based on rover's current rotation
      const rotatedOffsetX = orb.pickupOffsetX * Math.cos(roverAngle_rad) - orb.pickupOffsetY * Math.sin(roverAngle_rad);
      const rotatedOffsetY = orb.pickupOffsetX * Math.sin(roverAngle_rad) + orb.pickupOffsetY * Math.cos(roverAngle_rad);

      // Calculate new position in pixels
      const newX_px = roverX_px + rotatedOffsetX;
      const newY_px = roverY_px + rotatedOffsetY;

      // Update physics body position
      if (orb.physicsBody) {
        Body.setPosition(orb.physicsBody, { x: newX_px, y: newY_px });
      }

      // Update stored position in meters for detection
      orb.x_meters = this.environment.pixelsToMeters(newX_px);
      orb.y_meters = this.environment.pixelsToMeters(this.environment.environment_height_px - newY_px);
    }
  }

  // Check if any orbs are currently grabbed
  public hasGrabbedOrbs(): boolean {
    return this.diggableObjects.some(orb => orb.isPickedUp);
  }

  // Perform grab or release action
  setDigMode(enabled: boolean) {
    this.digModeEnabled = enabled;

    if (enabled) {
      // Trying to grab - only works if no orbs currently grabbed
      if (!this.hasGrabbedOrbs()) {
        this.grabOrbs();
      }
    } else {
      // Release all grabbed orbs at their current location
      for (const orb of this.diggableObjects) {
        if (orb.isPickedUp) {
          orb.isPickedUp = false;
          orb.pickupOffsetX = 0;
          orb.pickupOffsetY = 0;
          console.log(`Released orb: ${orb.name} at (${orb.x_meters.toFixed(2)}, ${orb.y_meters.toFixed(2)})`);
        }
      }
    }
  }

  draw(p: p5) {
    // Draw all regolith orbs using physics body positions
    for (const obj of this.diggableObjects) {
      const color = obj.color || '#8B4513';
      const rgb = this.app.hexToRgb(color) ?? { r: 139, g: 69, b: 19 };

      // Get position from physics body if it exists
      let x_px: number;
      let y_px: number;

      if (obj.physicsBody) {
        // Use physics body position (already in pixels)
        x_px = obj.physicsBody.position.x;
        y_px = obj.physicsBody.position.y;

        // Update meters position for detection
        obj.x_meters = this.environment.pixelsToMeters(x_px);
        obj.y_meters = this.environment.pixelsToMeters(this.environment.environment_height_px - y_px);
      } else {
        // Fallback to stored position
        x_px = this.environment.metersToPixels(obj.x_meters);
        y_px = this.environment.environment_height_px - this.environment.metersToPixels(obj.y_meters);
      }

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
