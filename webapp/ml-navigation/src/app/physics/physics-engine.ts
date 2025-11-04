import { Engine, World, Bodies, Body, Events, Vector, Composite } from 'matter-js';
import p5 from 'p5';

export interface PhysicsObject {
  body: Body;
  type: 'rover' | 'obstacle' | 'wall' | 'zone';
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

  // Create the rover physics body
  createRover(x: number, y: number, width: number, height: number, rotation: number = 0): Body {
    // Remove existing rover if any
    if (this.roverBody) {
      World.remove(this.world, this.roverBody);
    }

    // Create rover as a rectangle with proper physics properties
    this.roverBody = Bodies.rectangle(x, y, width, height, {
      label: 'rover',
      density: 0.002,
      friction: 0.8,
      frictionAir: 0.05,
      restitution: 0.3,
      angle: rotation * Math.PI / 180,
      inertia: Infinity // Prevent unwanted rotation on collision
    });

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

  // Get rover position and rotation
  getRoverState() {
    if (!this.roverBody) return null;

    return {
      x: this.roverBody.position.x,
      y: this.roverBody.position.y,
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

  // Reset rover position
  resetRover(x: number, y: number, angle: number = 0) {
    if (this.roverBody) {
      Body.setPosition(this.roverBody, { x, y });
      Body.setAngle(this.roverBody, angle * Math.PI / 180);
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