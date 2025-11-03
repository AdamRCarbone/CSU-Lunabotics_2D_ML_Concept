// src/app/Components/rover/rover_reset.ts
import { ResetTrigger } from '../../services/reset-trigger';
import { EnvironmentComponent } from '../../../environment/environment';
import { CollidableObject } from '../collidable-object/collidable-object';

export class RoverCollisionDetector {
  constructor(
    private resetTrigger: ResetTrigger,
    private environment: EnvironmentComponent
  ) {}

  //Check if rover collided with environment bounds or objects
  checkCollisions(
    roverCenterX: number,
    roverCenterY: number,
    boxOffsetX: number,
    boxOffsetY: number,
    boundLeft: number,
    boundRight: number,
    boundTop: number,
    boundBottom: number,
    rotation: number,
    collidableObjects: CollidableObject[] = []
  ): void {
    // Check environment boundary collisions
    if (this.checkEnvironmentBoundary(roverCenterX, roverCenterY, boxOffsetX, boxOffsetY, boundLeft, boundRight, boundTop, boundBottom, rotation)) {
      this.resetTrigger.triggerReset();
      return;
    }

    // Check collisions with all collidable objects
    for (const obj of collidableObjects) {
      if (obj.isCircular()) {
        if (this.checkCircularObjectCollision(roverCenterX, roverCenterY, boxOffsetX, boxOffsetY, boundLeft, boundRight, boundTop, boundBottom, rotation, obj)) {
          this.resetTrigger.triggerReset();
          return;
        }
      } else if (obj.isRectangular()) {
        if (this.checkRectangularObjectCollision(roverCenterX, roverCenterY, boxOffsetX, boxOffsetY, boundLeft, boundRight, boundTop, boundBottom, rotation, obj)) {
          this.resetTrigger.triggerReset();
          return;
        }
      }
    }
  }

  // Check if rover bounding box (with rotation) is touching or outside environment bounds
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

  //Check if rover's bounding box collides with circular object
  private checkCircularObjectCollision(
    roverCenterX: number,
    roverCenterY: number,
    boxOffsetX: number,
    boxOffsetY: number,
    boundLeft: number,
    boundRight: number,
    boundTop: number,
    boundBottom: number,
    rotation: number,
    obj: CollidableObject
  ): boolean {
    if (!obj.radius_meters) return false;

    // Convert object position from meters to pixels
    const objX_px = this.environment.metersToPixels(obj.x_meters);
    const objY_px = this.environment.environment_height_px - this.environment.metersToPixels(obj.y_meters); // Flip Y
    const objRadius_px = this.environment.metersToPixels(obj.radius_meters);

    // Rotate the offset to account for rover rotation
    const rotRad = (rotation * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);

    const rotatedOffsetX = boxOffsetX * cosR - boxOffsetY * sinR;
    const rotatedOffsetY = boxOffsetX * sinR + boxOffsetY * cosR;

    // Calculate bounding box center in world coordinates
    const boxCenterX = roverCenterX + rotatedOffsetX;
    const boxCenterY = roverCenterY + rotatedOffsetY;

    // Transform circle center to rover's local coordinate system (unrotate)
    const dx = objX_px - boxCenterX;
    const dy = objY_px - boxCenterY;
    const localX = dx * cosR + dy * sinR;
    const localY = -dx * sinR + dy * cosR;

    // Find closest point on the axis-aligned bounding box to the circle center
    const closestX = Math.max(-boundLeft, Math.min(localX, boundRight));
    const closestY = Math.max(-boundTop, Math.min(localY, boundBottom));

    // Calculate distance from closest point to circle center
    const distanceX = localX - closestX;
    const distanceY = localY - closestY;
    const distanceSquared = distanceX * distanceX + distanceY * distanceY;

    // Collision occurs if distance is less than circle radius
    return distanceSquared < (objRadius_px * objRadius_px);
  }


  // Check if rover's bounding box collides with rect. object (uses SAT) for rotated rectangle vs axis-aligned rectangle
  private checkRectangularObjectCollision(
    roverCenterX: number,
    roverCenterY: number,
    boxOffsetX: number,
    boxOffsetY: number,
    boundLeft: number,
    boundRight: number,
    boundTop: number,
    boundBottom: number,
    rotation: number,
    obj: CollidableObject
  ): boolean {
    if (!obj.width_meters || !obj.height_meters) return false;

    // Convert object position and dimensions from meters to pixels
    const objX_px = this.environment.metersToPixels(obj.x_meters);
    const objY_px = this.environment.environment_height_px - this.environment.metersToPixels(obj.y_meters); // Flip Y
    const objWidth_px = this.environment.metersToPixels(obj.width_meters);
    const objHeight_px = this.environment.metersToPixels(obj.height_meters);

    // Object rectangle (axis-aligned, centered at objX_px, objY_px)
    const objHalfWidth = objWidth_px / 2;
    const objHalfHeight = objHeight_px / 2;

    // Rotate the offset to account for rover rotation
    const rotRad = (rotation * Math.PI) / 180;
    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);

    const rotatedOffsetX = boxOffsetX * cosR - boxOffsetY * sinR;
    const rotatedOffsetY = boxOffsetX * sinR + boxOffsetY * cosR;

    // Calculate rover bounding box center in world coordinates
    const roverBoxCenterX = roverCenterX + rotatedOffsetX;
    const roverBoxCenterY = roverCenterY + rotatedOffsetY;

    // Get the 4 corners of the rover's rotated bounding box
    const roverCorners = [
      { x: -boundLeft, y: -boundTop },      // Top-left
      { x: boundRight, y: -boundTop },      // Top-right
      { x: boundRight, y: boundBottom },    // Bottom-right
      { x: -boundLeft, y: boundBottom }     // Bottom-left
    ];

    // Rotate and translate rover corners to world coordinates
    const roverWorldCorners = roverCorners.map(corner => {
      const rotatedX = corner.x * cosR - corner.y * sinR;
      const rotatedY = corner.x * sinR + corner.y * cosR;
      return {
        x: roverBoxCenterX + rotatedX,
        y: roverBoxCenterY + rotatedY
      };
    });

    // Get the 4 corners of the object rectangle
    const objCorners = [
      { x: objX_px - objHalfWidth, y: objY_px - objHalfHeight }, // Top-left
      { x: objX_px + objHalfWidth, y: objY_px - objHalfHeight }, // Top-right
      { x: objX_px + objHalfWidth, y: objY_px + objHalfHeight }, // Bottom-right
      { x: objX_px - objHalfWidth, y: objY_px + objHalfHeight }  // Bottom-left
    ];

    // Separating Axis Theorem: Test 4 axes (2 from rover, 2 from object)
    const axes = [
      { x: cosR, y: sinR },           // Rover's rotated X axis
      { x: -sinR, y: cosR },          // Rover's rotated Y axis
      { x: 1, y: 0 },                 // Object's X axis (axis-aligned)
      { x: 0, y: 1 }                  // Object's Y axis (axis-aligned)
    ];

    for (const axis of axes) {
      // Project rover corners onto axis
      const roverProjections = roverWorldCorners.map(corner =>
        corner.x * axis.x + corner.y * axis.y
      );
      const roverMin = Math.min(...roverProjections);
      const roverMax = Math.max(...roverProjections);

      // Project object corners onto axis
      const objProjections = objCorners.map(corner =>
        corner.x * axis.x + corner.y * axis.y
      );
      const objMin = Math.min(...objProjections);
      const objMax = Math.max(...objProjections);

      // Check for separation on this axis
      if (roverMax < objMin || objMax < roverMin) {
        // Separation found - no collision
        return false;
      }
    }

    // No separation found on any axis - collision detected
    return true;
  }
  
}