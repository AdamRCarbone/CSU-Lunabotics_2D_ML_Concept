import { Engine, World, Bodies, Body, Events, Vector, Composite } from 'matter-js';
import p5 from 'p5';

export interface PhysicsObject {
  body: Body;
  type: 'rover' | 'obstacle' | 'wall' | 'zone' | 'diggable';
  render?: (p: p5) => void;
}

export class PhysicsEngine {
  private engine: Engine;
  private world: World;
  private objects: Map<number, PhysicsObject> = new Map();
  private roverBody: Body | null = null;
  private collisionCallback: (() => void) | null = null;

  // Physics settings
  private readonly PHYSICS_SCALE = 100; // pixels per meter
  private readonly TIME_STEP = 1000 / 60; // 60 FPS

  constructor() {
    this.engine = Engine.create({
      gravity: { x: 0, y: 0 }, // Top-down view, no gravity
      enableSleeping: false
    });
    this.world = this.engine.world;

    // Set up collision events
    Events.on(this.engine, 'collisionStart', (event) => {
      this.handleCollision(event);
    });
  }

  // Set collision callback
  setCollisionCallback(callback: () => void) {
    this.collisionCallback = callback;
  }

  // Create the rover physics body with offset support
  createRover(x: number, y: number, width: number, height: number, rotation: number = 0, offsetX: number = 0, offsetY: number = 0): Body {
    // Remove existing rover if any
    if (this.roverBody) {
      World.remove(this.world, this.roverBody);
    }

    // Apply rotation to the offset
    const angleRad = rotation * Math.PI / 180;
    const rotatedOffsetX = offsetX * Math.cos(angleRad) - offsetY * Math.sin(angleRad);
    const rotatedOffsetY = offsetX * Math.sin(angleRad) + offsetY * Math.cos(angleRad);

    // Create rover at offset position
    this.roverBody = Bodies.rectangle(x + rotatedOffsetX, y + rotatedOffsetY, width, height, {
      label: 'rover',
      density: 0.002,
      friction: 0.8,
      frictionAir: 0.05,
      restitution: 0.3,
      angle: angleRad,
      inertia: Infinity // Prevent unwanted rotation on collision
    });

    // Store the offset for later use
    (this.roverBody as any).offsetX = offsetX;
    (this.roverBody as any).offsetY = offsetY;

    World.add(this.world, this.roverBody);
    this.objects.set(this.roverBody.id, { body: this.roverBody, type: 'rover' });

    return this.roverBody;
  }

  // Create environment boundaries
  createBoundaries(width: number, height: number, thickness: number = 50) {
    const walls = [
      // Top wall - positioned just outside visible area
      Bodies.rectangle(width / 2, -thickness / 2, width + thickness * 2, thickness, {
        isStatic: true, label: 'wall-top'
      }),
      // Bottom wall - positioned just outside visible area
      Bodies.rectangle(width / 2, height + thickness / 2, width + thickness * 2, thickness, {
        isStatic: true, label: 'wall-bottom'
      }),
      // Left wall - positioned just outside visible area
      Bodies.rectangle(-thickness / 2, height / 2, thickness, height + thickness * 2, {
        isStatic: true, label: 'wall-left'
      }),
      // Right wall - positioned just outside visible area
      Bodies.rectangle(width + thickness / 2, height / 2, thickness, height + thickness * 2, {
        isStatic: true, label: 'wall-right'
      })
    ];

    walls.forEach(wall => {
      World.add(this.world, wall);
      this.objects.set(wall.id, { body: wall, type: 'wall' });
    });
  }

  // Add obstacles (rocks, craters, etc.)
  addObstacle(x: number, y: number, radius: number, label: string = 'obstacle'): Body {
    const obstacle = Bodies.circle(x, y, radius, {
      isStatic: true,
      label: label,
      restitution: 0.8,
      friction: 0.8,
      density: 1
    });

    World.add(this.world, obstacle);
    this.objects.set(obstacle.id, { body: obstacle, type: 'obstacle' });

    return obstacle;
  }

  // Add rectangular obstacle (for column post)
  addRectangleObstacle(x: number, y: number, width: number, height: number, label: string = 'obstacle'): Body {
    const obstacle = Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      label: label,
      restitution: 0.8,
      friction: 0.8,
      density: 1
    });

    World.add(this.world, obstacle);
    this.objects.set(obstacle.id, { body: obstacle, type: 'obstacle' });

    return obstacle;
  }

  // Add pushable diggable object (regolith orb)
  addDiggable(x: number, y: number, radius: number, label: string = 'regolith'): Body {
    const diggable = Bodies.circle(x, y, radius, {
      isStatic: false, // Make it dynamic (pushable)
      label: label,
      restitution: 0.1, // Low bounce
      friction: 0.9, // High friction with other surfaces
      frictionAir: 0.3, // High air resistance to stop sliding quickly
      density: 0.001, // Light weight so it's easy to push
      inertia: Infinity // Prevent rotation
    });

    World.add(this.world, diggable);
    this.objects.set(diggable.id, { body: diggable, type: 'diggable' });

    return diggable;
  }

  // Apply force to rover (for movement)
  moveRover(force: Vector) {
    if (this.roverBody) {
      Body.applyForce(this.roverBody, this.roverBody.position, force);
    }
  }

  // Set rover velocity directly
  setRoverVelocity(vx: number, vy: number) {
    if (this.roverBody) {
      Body.setVelocity(this.roverBody, { x: vx, y: vy });
    }
  }

  // Rotate rover
  rotateRover(angle: number) {
    if (this.roverBody) {
      Body.setAngle(this.roverBody, angle * Math.PI / 180);
    }
  }

  // Set rover angular velocity
  setRoverAngularVelocity(angularVelocity: number) {
    if (this.roverBody) {
      Body.setAngularVelocity(this.roverBody, angularVelocity);
    }
  }

  // Get rover position and rotation (accounting for offset)
  getRoverState() {
    if (!this.roverBody) return null;

    // Get stored offset
    const offsetX = (this.roverBody as any).offsetX || 0;
    const offsetY = (this.roverBody as any).offsetY || 0;

    // Calculate the visual position by reversing the offset
    const angle = this.roverBody.angle;
    const rotatedOffsetX = offsetX * Math.cos(angle) - offsetY * Math.sin(angle);
    const rotatedOffsetY = offsetX * Math.sin(angle) + offsetY * Math.cos(angle);

    return {
      x: this.roverBody.position.x - rotatedOffsetX,
      y: this.roverBody.position.y - rotatedOffsetY,
      angle: this.roverBody.angle * 180 / Math.PI,
      vx: this.roverBody.velocity.x,
      vy: this.roverBody.velocity.y,
      angularVelocity: this.roverBody.angularVelocity
    };
  }

  // Update physics simulation
  update(deltaTime: number = 16.67) {
    Engine.update(this.engine, deltaTime);
  }

  // Handle collisions
  private handleCollision(event: any) {
    const pairs = event.pairs;

    for (const pair of pairs) {
      const { bodyA, bodyB } = pair;

      // Check if rover is involved in collision
      if (bodyA.label === 'rover' || bodyB.label === 'rover') {
        const otherBody = bodyA.label === 'rover' ? bodyB : bodyA;

        // Trigger callback for collisions with walls or obstacles
        if (otherBody.label.includes('wall') || otherBody.label.includes('obstacle') ||
            otherBody.label.includes('rock') || otherBody.label.includes('crater') ||
            otherBody.label.includes('column')) {
          console.log('Collision detected with:', otherBody.label);

          // Trigger the reset callback
          if (this.collisionCallback) {
            this.collisionCallback();
          }
        }
      }
    }
  }

  // Clear all obstacles (keep walls and rover)
  clearObstacles() {
    const obstacleBodies = Array.from(this.objects.entries())
      .filter(([_, obj]) => obj.type === 'obstacle')
      .map(([_, obj]) => obj.body);

    Composite.remove(this.world, obstacleBodies);

    // Remove from our tracking map
    this.objects.forEach((obj, id) => {
      if (obj.type === 'obstacle') {
        this.objects.delete(id);
      }
    });
  }

  // Clear all diggable objects
  clearDiggables() {
    const diggableBodies = Array.from(this.objects.entries())
      .filter(([_, obj]) => obj.type === 'diggable')
      .map(([_, obj]) => obj.body);

    Composite.remove(this.world, diggableBodies);

    // Remove from our tracking map
    this.objects.forEach((obj, id) => {
      if (obj.type === 'diggable') {
        this.objects.delete(id);
      }
    });
  }

  // Reset rover position
  resetRover(x: number, y: number, angle: number = 0) {
    if (this.roverBody) {
      // Get stored offset
      const offsetX = (this.roverBody as any).offsetX || 0;
      const offsetY = (this.roverBody as any).offsetY || 0;

      // Apply rotation to the offset
      const angleRad = angle * Math.PI / 180;
      const rotatedOffsetX = offsetX * Math.cos(angleRad) - offsetY * Math.sin(angleRad);
      const rotatedOffsetY = offsetX * Math.sin(angleRad) + offsetY * Math.cos(angleRad);

      Body.setPosition(this.roverBody, { x: x + rotatedOffsetX, y: y + rotatedOffsetY });
      Body.setAngle(this.roverBody, angleRad);
      Body.setVelocity(this.roverBody, { x: 0, y: 0 });
      Body.setAngularVelocity(this.roverBody, 0);
    }
  }

  // Get all bodies for rendering
  getBodies() {
    return Composite.allBodies(this.world);
  }

  // Cleanup
  destroy() {
    Events.off(this.engine, 'collisionStart');
    World.clear(this.world, false);
    Engine.clear(this.engine);
  }
}