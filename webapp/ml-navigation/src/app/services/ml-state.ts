// ML State Service - Aggregates game state into observation vector

import { Injectable } from '@angular/core';
import { EnvironmentComponent } from '../../environment/environment';
import { MLObservation, observationToArray } from '../interfaces/ml-types';
import { Zone } from '../enums/zone.enum';

@Injectable({
  providedIn: 'root'
})
export class MLStateService {
  private environment: EnvironmentComponent | null = null;

  setEnvironment(env: EnvironmentComponent) {
    this.environment = env;
  }

  /**
   * Get current state as ML observation
   */
  getObservation(): MLObservation {
    const obs: MLObservation = {
      // Rover state
      rover_x: this.getRoverX(),
      rover_y: this.getRoverY(),
      rover_heading: this.getRoverHeading(),
      rover_speed: this.getRoverSpeed(),

      // Digging state
      is_holding_orbs: this.isHoldingOrbs() ? 1 : 0,
      num_orbs_held: this.getNumOrbsHeld(),

      // Zone info
      in_excavation_zone: this.isInZone(Zone.EXCAVATION) ? 1 : 0,
      in_construction_zone: this.isInZone(Zone.CONSTRUCTION) ? 1 : 0,
      in_berm_zone: this.isInZone(Zone.TARGET_BERM) ? 1 : 0,
      in_obstacle_zone: this.isInZone(Zone.OBSTACLE) ? 1 : 0,

      // Nearest orb
      ...this.getNearestOrbInfo(),

      // Obstacles in frustum
      obstacles: this.getObstacleInfo(),

      // Target zone direction
      ...this.getConstructionZoneDirection()
    };

    return obs;
  }

  /**
   * Get observation as flat array for ML model
   */
  getObservationArray(): number[] {
    return observationToArray(this.getObservation());
  }

  // ==================== Rover State ====================

  private getRoverX(): number {
    if (!this.environment?.physicsEngine) return 0.5;
    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return 0.5;

    // Normalize to 0-1
    return state.x / this.environment.environment_width_px;
  }

  private getRoverY(): number {
    if (!this.environment?.physicsEngine) return 0.5;
    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return 0.5;

    // Normalize to 0-1 (flip Y axis - canvas y=0 is top)
    return 1.0 - (state.y / this.environment.environment_height_px);
  }

  private getRoverHeading(): number {
    if (!this.environment?.physicsEngine) return 0;
    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return 0;

    // Normalize 0-360° to 0-1
    return (state.angle % 360) / 360;
  }

  private getRoverSpeed(): number {
    if (!this.environment?.rover) return 0;
    // Already in range -1 to 1
    return this.environment.rover.currentSpeed;
  }

  // ==================== Digging State ====================

  private isHoldingOrbs(): boolean {
    return this.environment?.diggingField?.hasGrabbedOrbs() ?? false;
  }

  private getNumOrbsHeld(): number {
    if (!this.environment?.diggingField) return 0;

    const orbs = this.environment.diggingField.diggableObjects;
    const heldCount = orbs.filter(orb => orb.isPickedUp).length;

    // Normalize to 0-1 (assuming max 15 orbs)
    return heldCount / 15;
  }

  // ==================== Zone Info ====================

  private isInZone(zone: Zone): boolean {
    return this.environment?.currentZone === zone;
  }

  // ==================== Nearest Orb ====================

  private getNearestOrbInfo(): {
    nearest_orb_distance: number;
    nearest_orb_angle: number;
    nearest_orb_in_grab_zone: number;
  } {
    if (!this.environment?.diggingField || !this.environment?.physicsEngine) {
      return {
        nearest_orb_distance: 1.0,
        nearest_orb_angle: 0,
        nearest_orb_in_grab_zone: 0
      };
    }

    const roverState = this.environment.physicsEngine.getRoverState();
    if (!roverState) {
      return {
        nearest_orb_distance: 1.0,
        nearest_orb_angle: 0,
        nearest_orb_in_grab_zone: 0
      };
    }

    const orbs = this.environment.diggingField.diggableObjects.filter(orb => !orb.isPickedUp);

    if (orbs.length === 0) {
      return {
        nearest_orb_distance: 1.0,
        nearest_orb_angle: 0,
        nearest_orb_in_grab_zone: 0
      };
    }

    // Find nearest orb
    let minDist = Infinity;
    let nearestOrb: any = null;

    for (const orb of orbs) {
      const orbX_px = this.environment.metersToPixels(orb.x_meters);
      const orbY_px = this.environment.environment_height_px - this.environment.metersToPixels(orb.y_meters);

      const dx = orbX_px - roverState.x;
      const dy = orbY_px - roverState.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist) {
        minDist = dist;
        nearestOrb = { x: orbX_px, y: orbY_px, orb };
      }
    }

    if (!nearestOrb) {
      return {
        nearest_orb_distance: 1.0,
        nearest_orb_angle: 0,
        nearest_orb_in_grab_zone: 0
      };
    }

    // Calculate relative angle
    const dx = nearestOrb.x - roverState.x;
    const dy = nearestOrb.y - roverState.y;
    const angleToOrb = Math.atan2(dx, -dy) * 180 / Math.PI; // -dy because canvas Y is flipped
    const roverHeading = roverState.angle;

    let relativeAngle = angleToOrb - roverHeading;
    // Normalize to -180 to 180
    while (relativeAngle > 180) relativeAngle -= 360;
    while (relativeAngle < -180) relativeAngle += 360;

    // Normalize distance (max distance = diagonal of environment)
    const maxDist = Math.sqrt(
      this.environment.environment_width_px ** 2 +
      this.environment.environment_height_px ** 2
    );

    // Check if in grab zone
    const inGrabZone = this.environment.diggingField.canGrab() ? 1 : 0;

    return {
      nearest_orb_distance: Math.min(minDist / maxDist, 1.0),
      nearest_orb_angle: relativeAngle / 180, // Normalize to -1 to 1
      nearest_orb_in_grab_zone: inGrabZone
    };
  }

  // ==================== Obstacles ====================

  private getObstacleInfo(): number[] {
    const maxObstacles = 5;
    const result: number[] = [];

    if (!this.environment?.frustum || !this.environment?.physicsEngine) {
      // Pad with defaults (1.0 distance means "no obstacle", 0.0 angle, 0.0 radius)
      return new Array(maxObstacles * 3).fill(0).map((_, i) => i % 3 === 0 ? 1.0 : 0.0);
    }

    const roverState = this.environment.physicsEngine.getRoverState();
    if (!roverState) {
      return new Array(maxObstacles * 3).fill(0).map((_, i) => i % 3 === 0 ? 1.0 : 0.0);
    }

    const obstacles = this.environment.frustum.detectedCollidableObjects || [];

    // Calculate distance, angle, and radius for each obstacle
    const obstacleData: Array<{ dist: number; angle: number; radius: number }> = [];

    for (const obstacle of obstacles) {
      const obsX_px = this.environment.metersToPixels(obstacle.x_meters);
      const obsY_px = this.environment.environment_height_px - this.environment.metersToPixels(obstacle.y_meters);

      const dx = obsX_px - roverState.x;
      const dy = obsY_px - roverState.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const angleToObs = Math.atan2(dx, -dy) * 180 / Math.PI;
      let relativeAngle = angleToObs - roverState.angle;

      while (relativeAngle > 180) relativeAngle -= 360;
      while (relativeAngle < -180) relativeAngle += 360;

      // Get obstacle radius (in pixels, normalized)
      const radius_px = obstacle.radius_meters
        ? this.environment.metersToPixels(obstacle.radius_meters)
        : 0;

      obstacleData.push({ dist, angle: relativeAngle, radius: radius_px });
    }

    // Sort by distance (closest first)
    obstacleData.sort((a, b) => a.dist - b.dist);

    // Take up to 5 closest obstacles
    const maxDist = Math.sqrt(
      this.environment.environment_width_px ** 2 +
      this.environment.environment_height_px ** 2
    );

    for (let i = 0; i < maxObstacles; i++) {
      if (i < obstacleData.length) {
        const obs = obstacleData[i];
        result.push(Math.min(obs.dist / maxDist, 1.0)); // Normalized distance
        result.push(obs.angle / 180); // Normalized angle -1 to 1
        result.push(Math.min(obs.radius / maxDist, 1.0)); // Normalized radius
      } else {
        result.push(1.0); // No obstacle (far away)
        result.push(0.0); // Default angle
        result.push(0.0); // Default radius
      }
    }

    return result;
  }

  // ==================== Construction Zone Direction ====================

  private getConstructionZoneDirection(): {
    construction_zone_distance: number;
    construction_zone_angle: number;
  } {
    if (!this.environment?.zoneDisplay || !this.environment?.physicsEngine) {
      return {
        construction_zone_distance: 1.0,
        construction_zone_angle: 0
      };
    }

    const roverState = this.environment.physicsEngine.getRoverState();
    if (!roverState) {
      return {
        construction_zone_distance: 1.0,
        construction_zone_angle: 0
      };
    }

    // Construction zone is on the right side
    const constructionZoneCenterX =
      (this.environment.zoneDisplay.excavationZone_width_meters + this.environment.environment_width_meters) / 2;
    const constructionZoneCenterY = this.environment.environment_height_meters / 2;

    // Convert to pixels
    const targetX_px = this.environment.metersToPixels(constructionZoneCenterX);
    const targetY_px = this.environment.environment_height_px - this.environment.metersToPixels(constructionZoneCenterY);

    const dx = targetX_px - roverState.x;
    const dy = targetY_px - roverState.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const angleToTarget = Math.atan2(dx, -dy) * 180 / Math.PI;
    let relativeAngle = angleToTarget - roverState.angle;

    while (relativeAngle > 180) relativeAngle -= 360;
    while (relativeAngle < -180) relativeAngle += 360;

    const maxDist = Math.sqrt(
      this.environment.environment_width_px ** 2 +
      this.environment.environment_height_px ** 2
    );

    return {
      construction_zone_distance: Math.min(dist / maxDist, 1.0),
      construction_zone_angle: relativeAngle / 180
    };
  }
}
