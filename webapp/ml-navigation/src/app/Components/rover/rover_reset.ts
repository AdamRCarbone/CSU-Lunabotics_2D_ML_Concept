// src/app/Components/rover/rover_reset.ts
import { ResetTrigger } from '../../services/reset-trigger';
import { EnvironmentComponent } from '../../../environment/environment';

export class RoverCollisionDetector {
  constructor(
    private resetTrigger: ResetTrigger,
    private environment: EnvironmentComponent
  ) {}

  //Check if rover collided with environment bounds
  checkCollisions(
    roverCenterX: number,
    roverCenterY: number,
    boxOffsetX: number,
    boxOffsetY: number,
    boundLeft: number,
    boundRight: number,
    boundTop: number,
    boundBottom: number,
    rotation: number
  ): void {
    // Check environment boundary collisions
    if (this.checkEnvironmentBoundary(roverCenterX, roverCenterY, boxOffsetX, boxOffsetY, boundLeft, boundRight, boundTop, boundBottom, rotation)) {
      this.resetTrigger.triggerReset();
    }
  }

  //Check if rover bounding box (with rotation) is touching or outside environment boundaries
  private checkEnvironmentBoundary(
    roverCenterX: number,
    roverCenterY: number,
    boxOffsetX: number,
    boxOffsetY: number,
    boundLeft: number,
    boundRight: number,
    boundTop: number,
    boundBottom: number,
    rotation: number
  ): boolean {
    const envWidth = this.environment.environment_width_px;
    const envHeight = this.environment.environment_height_px;
    const strokeWeight = this.environment.environment_stroke_weight_px;

    // Environment boundaries (accounting for stroke)
    const envLeft = strokeWeight / 2;
    const envRight = envWidth - strokeWeight / 2;
    const envTop = strokeWeight / 2;
    const envBottom = envHeight - strokeWeight / 2;

    // Rotate the offset to account for rover rotation
    const rotRad = (rotation * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);

    const rotatedOffsetX = boxOffsetX * cosR - boxOffsetY * sinR;
    const rotatedOffsetY = boxOffsetX * sinR + boxOffsetY * cosR;

    // Calculate bounding box center in world coordinates
    const boxCenterX = roverCenterX + rotatedOffsetX;
    const boxCenterY = roverCenterY + rotatedOffsetY;

    // Calculate 4 corners of bounding box relative to box center
    const corners = [
      { x: -boundLeft, y: -boundTop },      // Top-left
      { x: boundRight, y: -boundTop },      // Top-right
      { x: boundRight, y: boundBottom },    // Bottom-right
      { x: -boundLeft, y: boundBottom }     // Bottom-left
    ];

    // Rotate and translate corners to world coordinates
    for (const corner of corners) {
      // Rotate corner
      const rotatedX = corner.x * cosR - corner.y * sinR;
      const rotatedY = corner.x * sinR + corner.y * cosR;

      // Translate to world position
      const worldX = boxCenterX + rotatedX;
      const worldY = boxCenterY + rotatedY;

      // Check if corner is outside environment
      if (worldX <= envLeft || worldX >= envRight || worldY <= envTop || worldY >= envBottom) {
        return true;
      }
    }

    return false;
  }

  // Add more collision detection methods here as needed:
  // private checkObstacleCollision(...) { ... }
  // private checkHazardCollision(...) { ... }
}