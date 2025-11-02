// src/app/Components/collidable-object/collidable-object.ts

export enum CollisionShape {
  CIRCLE = 'circle',
  RECTANGLE = 'rectangle',
  // Add more shapes as needed: POLYGON, etc.
}

export interface CollidableObjectConfig {
  x_meters: number;          // X position in meters
  y_meters: number;          // Y position in meters
  shape: CollisionShape;     // Shape type
  radius_meters?: number;    // For circles (diameter = 2 * radius)
  width_meters?: number;     // For rectangles
  height_meters?: number;    // For rectangles
  color?: string;            // Optional color for rendering
  name?: string;             // Optional name for debugging
}

//Base class for all collidable objects in the environment.
//Objects like posts, craters, rocks, etc. inherit from this.
export class CollidableObject {
  // Position in meters
  public x_meters: number;
  public y_meters: number;

  // Dimensions in meters
  public radius_meters?: number;
  public width_meters?: number;
  public height_meters?: number;

  // Shape and visual properties
  public shape: CollisionShape;
  public color: string;
  public name: string;

  constructor(config: CollidableObjectConfig) {
    this.x_meters = config.x_meters;
    this.y_meters = config.y_meters;
    this.shape = config.shape;
    this.radius_meters = config.radius_meters;
    this.width_meters = config.width_meters;
    this.height_meters = config.height_meters;
    this.color = config.color || '#FF0000';
    this.name = config.name || 'CollidableObject';
  }

  //Check if this object is a circular shape
  isCircular(): boolean {
    return this.shape === CollisionShape.CIRCLE && this.radius_meters !== undefined;
  }

  //Check if this object is a rectangular shape
  isRectangular(): boolean {
    return this.shape === CollisionShape.RECTANGLE &&
           this.width_meters !== undefined &&
           this.height_meters !== undefined;
  }

  //Get the diameter for circular objects (convenience method)
  getDiameter(): number {
    return this.radius_meters ? this.radius_meters * 2 : 0;
  }
}
