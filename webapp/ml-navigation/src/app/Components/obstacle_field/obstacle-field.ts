import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { EnvironmentComponent } from '../../../environment/environment';
import { WindowSizeService } from '../../services/window-size';
import { App } from '../../app';
import { CollidableObject, CollisionShape } from '../collidable-object/collidable-object';
import { Subscription } from 'rxjs';
import { ZoneDisplay } from '../zone_display/zone-display';
import * as THREE from 'three';
import { SceneManager } from '../../three/scene-manager';

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

  private windowSizeSubscription!: Subscription;
  private sceneManager!: SceneManager;
  private obstacleMeshes: THREE.Mesh[] = [];

  // Collidable objects (obstacles) in the environment
  public collidableObjects: CollidableObject[] = [];

  // Obstacle generation settings
  public numRocks: number = 7;           // Number of rocks to generate
  public numCraters: number = 4;         // Number of craters to generate
  public rockMinRadius: number = 0.15;   // Min radius for rocks (0.3m diameter)
  public rockMaxRadius: number = 0.2;    // Max radius for rocks (0.4m diameter)
  public craterMinRadius: number = 0.15; // Min radius for craters (0.3m diameter)
  public craterMaxRadius: number = 0.25; // Max radius for craters (0.5m diameter)
  public minSpacing: number = 0.666;       // Min spacing between obstacles (meters) - allows rover to pass

  // Zone dimensions from zone-display (for determining allowed zones)
  private startingZone_width_meters: number = 2;
  private startingZone_height_meters: number = 2;
  private constructionZone_width_meters: number = 3;
  private constructionZone_height_meters: number = 1.5;

  ngOnInit() {
    // Initialize obstacles
    this.generateObstacles();

    // Subscribe to window size changes (if needed for future updates)
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {
      // Currently obstacles don't need to regenerate on resize
      // But subscription is here if needed in the future
    });
  }

  ngOnDestroy() {
    if (this.windowSizeSubscription) {
      this.windowSizeSubscription.unsubscribe();
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

  // Check if position is in excavation or obstacle zones (no start or construction zones)
  private isInAllowedZone(x: number, y: number): boolean {
    // Starting zone: bottom-left, 2x2m
    const inStartingZone = x < this.startingZone_width_meters &&
                          y < this.startingZone_height_meters;

    // Construction zone: bottom-right, 3m wide x 1.5m tall
    const constructionZoneLeft = this.environment.environment_width_meters - this.constructionZone_width_meters;
    const inConstructionZone = x > constructionZoneLeft &&
                               y < this.constructionZone_height_meters;

    // Column post area: center of environment (0.75m x 0.75m)
    const columnHalfWidth = 0.375;
    const columnHalfHeight = 0.375;
    const centerX = this.environment.environment_width_meters / 2;
    const centerY = this.environment.environment_height_meters / 2;
    const inColumnZone = Math.abs(x - centerX) < (columnHalfWidth + 0.5) &&
                        Math.abs(y - centerY) < (columnHalfHeight + 0.5);

    // Allow if NOT in starting, construction, or column zones
    return !inStartingZone && !inConstructionZone && !inColumnZone;
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

  // Initialize Three.js objects
  initializeThree(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;

    console.log('Initializing obstacles, count:', this.collidableObjects.length);

    // Clear existing meshes
    this.obstacleMeshes.forEach(mesh => {
      if (mesh.parent) mesh.parent.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) mesh.material.dispose();
    });
    this.obstacleMeshes = [];

    // Create Three.js meshes for all obstacles
    for (const obj of this.collidableObjects) {
      if (!obj.isCircular() || !obj.radius_meters) continue;

      console.log('Creating obstacle:', obj.name, 'at', obj.x_meters, obj.y_meters, 'radius:', obj.radius_meters);

      // Convert meters to pixels (y_meters is from bottom, so we need to invert)
      const x_px = (obj.x_meters / this.environment.environment_width_meters) * this.environment.environment_width_px;
      const y_px = this.environment.environment_height_px - ((obj.y_meters / this.environment.environment_height_meters) * this.environment.environment_height_px);
      const radius_px = this.environment.metersToPixels(obj.radius_meters);

      // Determine type (rock or crater) based on name
      const type = obj.name?.toLowerCase().includes('crater') ? 'crater' : 'rock';

      // Create obstacle mesh
      const mesh = this.sceneManager.createObstacle(x_px, y_px, radius_px, type);
      this.obstacleMeshes.push(mesh);
    }
  }

  // Update Three.js objects (called from animation loop)
  updateThree() {
    // Obstacles are static, no updates needed in animation loop
    // This method is here for consistency with other components
  }
}
