// src/app/Components/rover/rover_reset.ts
import { ResetTrigger } from '../../services/reset-trigger';
import { EnvironmentComponent } from '../../../environment/environment';

export class RoverCollisionDetector {
  constructor(
    private resetTrigger: ResetTrigger,
    private environment: EnvironmentComponent
  ) {}

  //Check if rover collided with environment bounds
  checkCollisions(roverX: number, roverY: number, roverWidth: number, roverHeight: number): void {
    // Check environment boundary collisions
    if (this.checkEnvironmentBoundary(roverX, roverY, roverWidth, roverHeight)) {
      this.resetTrigger.triggerReset();
    }
  }

  //Check if rover is touching or outside environment boundaries
  private checkEnvironmentBoundary(
    roverX: number,
    roverY: number,
    roverWidth: number,
    roverHeight: number
  ): boolean {
    const envWidth = this.environment.environment_width_px;
    const envHeight = this.environment.environment_height_px;
    const strokeWeight = this.environment.environment_stroke_weight_px;

    // Calculate rover bounds (accounting for origin being at top-left of rover)
    const roverLeft = roverX;
    const roverRight = roverX + roverWidth;
    const roverTop = roverY;
    const roverBottom = roverY + roverHeight;

    // Environment boundaries (accounting for stroke)
    const envLeft = strokeWeight / 2;
    const envRight = envWidth - strokeWeight / 2;
    const envTop = strokeWeight / 2;
    const envBottom = envHeight - strokeWeight / 2;

    // Check if rover is outside or touching boundaries
    return (
      roverLeft <= envLeft ||
      roverRight >= envRight ||
      roverTop <= envTop ||
      roverBottom >= envBottom
    );
  }

  // Add more collision detection methods here as needed:
  // private checkObstacleCollision(...) { ... }
  // private checkHazardCollision(...) { ... }
}