import { Component, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { EnvironmentComponent } from '../../../environment/environment';
import { WindowSizeService } from '../../../app/services/window-size';
import { App } from '../../app';
import { CollidableObject, CollisionShape } from '../collidable-object/collidable-object';
import { ZONE_COLORS } from '../zone-legend/zone-legend';
import * as THREE from 'three';
import { SceneManager } from '../../three/scene-manager';


@Component({
  selector: 'app-zone-display',
  imports: [],
  templateUrl: './zone-display.html',
  styleUrl: './zone-display.css',
})
export class ZoneDisplay {
  environment = inject(EnvironmentComponent);
  windowSizeService = inject(WindowSizeService);
  app = inject(App);

  //2x2m region in bottom left of environment
  private sceneManager!: SceneManager;
  private windowSizeSubscription!: Subscription;
  private zoneMeshes: THREE.Mesh[] = [];
  private columnMesh!: THREE.Mesh;

  // Collidable objects in the environment
  public collidableObjects: CollidableObject[] = [];

  //Starting Zone
  public startingZone_width_meters: number = 2;
  public startingZone_height_meters: number = 2;
  public startingZone_width_px!: number;
  public startingZone_height_px!: number;
  public startingZone_color: string = ZONE_COLORS.startingZone;

  //Excavation Zone
  public excavationZone_width_meters: number = 2.5;
  public excavationZone_height_meters: number = this.environment.environment_height_meters;
  public excavationZone_width_px!: number;
  public excavationZone_height_px!: number;
  public excavationZone_color: string = ZONE_COLORS.excavationZone;

  //Obstacle Zone
  public obstacleZone_width_meters: number = 4.38;
  public obstacleZone_height_meters: number = this.environment.environment_height_meters;
  public obstacleZone_width_px!: number;
  public obstacleZone_height_px!: number;
  public obstacleZone_color: string = ZONE_COLORS.obstacleZone;

  //Construction Zone
  public constructionZone_width_meters: number = 3;
  public constructionZone_height_meters: number = 1.5;
  public constructionZone_width_px!: number;
  public constructionZone_height_px!: number;
  public constructionZone_color: string = ZONE_COLORS.constructionZone;

  //Target Berm Zone
  public targetbermZone_width_meters: number = 1.7;
  public targetbermZone_height_meters: number = 0.8;
  public targetbermZone_width_px!: number;
  public targetbermZone_height_px!: number;
  public targetbermZone_color: string = ZONE_COLORS.targetBermZone;

  //Column Post Zone
  public columnZone_width_meters: number = 0.75;
  public columnZone_height_meters: number = 0.75;
  public columnZone_width_px!: number;
  public columnZone_height_px!: number;
  public columnZone_color: string = ZONE_COLORS.columnPostZone;

  ngOnInit() {
    // Initialize collidable objects
    this.initializeCollidableObjects();

    // Subscribe to window size changes
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {

      //Starting Zone
      this.startingZone_width_px = this.environment.metersToPixels(this.startingZone_width_meters);
      this.startingZone_height_px = this.environment.metersToPixels(this.startingZone_height_meters);

      //Excavation Zone
      this.excavationZone_width_px = this.environment.metersToPixels(this.excavationZone_width_meters);
      this.excavationZone_height_px = this.environment.metersToPixels(this.excavationZone_height_meters);

      //Obstacle Zone
      this.obstacleZone_width_px = this.environment.metersToPixels(this.obstacleZone_width_meters);
      this.obstacleZone_height_px = this.environment.metersToPixels(this.obstacleZone_height_meters);

      //Construction Zone
      this.constructionZone_width_px = this.environment.metersToPixels(this.constructionZone_width_meters);
      this.constructionZone_height_px = this.environment.metersToPixels(this.constructionZone_height_meters);

      //Target Berm Zone
      this.targetbermZone_width_px = this.environment.metersToPixels(this.targetbermZone_width_meters);
      this.targetbermZone_height_px = this.environment.metersToPixels(this.targetbermZone_height_meters);

      //Column Post Zone
      this.columnZone_width_px = this.environment.metersToPixels(this.columnZone_width_meters);
      this.columnZone_height_px = this.environment.metersToPixels(this.columnZone_height_meters);
    });
  }

//Initialize collidable objects in the environment
  private initializeCollidableObjects() {
    this.collidableObjects = [];

    // Column Post
    const columnPost = new CollidableObject({
      x_meters: this.environment.environment_width_meters / 2,
      y_meters: this.environment.environment_height_meters / 2,
      shape: CollisionShape.RECTANGLE,
      width_meters: this.columnZone_width_meters,
      height_meters: this.columnZone_height_meters,
      color: this.columnZone_color,
      name: 'Column Post'
    });
    this.collidableObjects.push(columnPost);
  }

  // Initialize Three.js objects
  initializeThree(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;

    // Clear existing meshes
    this.zoneMeshes.forEach(mesh => {
      if (mesh.parent) mesh.parent.remove(mesh);
    });
    this.zoneMeshes = [];

    const sw = this.environment.environment_stroke_weight_px;
    const strokeOffset = sw/2;
    const stroke_weight_comp = 1.25*sw;

    // Starting Zone
    const sz_color = parseInt(this.startingZone_color.replace('#', ''), 16);
    const sz_x = 0;
    const sz_y = 0; // Bottom-left corner
    this.zoneMeshes.push(
      this.sceneManager.createZone(sz_x, sz_y, this.startingZone_width_px, this.startingZone_height_px, sz_color, 0.2)
    );

    // Excavation Zone
    const ez_color = parseInt(this.excavationZone_color.replace('#', ''), 16);
    const ez_x = 0;
    const ez_y = 0;
    this.zoneMeshes.push(
      this.sceneManager.createZone(ez_x, ez_y, this.excavationZone_width_px, this.excavationZone_height_px, ez_color, 0.12)
    );

    // Obstacle Zone
    const oz_color = parseInt(this.obstacleZone_color.replace('#', ''), 16);
    const oz_x = this.environment.environment_width_px - this.obstacleZone_width_px;
    const oz_y = 0;
    this.zoneMeshes.push(
      this.sceneManager.createZone(oz_x, oz_y, this.obstacleZone_width_px, this.obstacleZone_height_px, oz_color, 0.12)
    );

    // Construction Zone
    const cz_color = parseInt(this.constructionZone_color.replace('#', ''), 16);
    const cz_x = this.environment.environment_width_px - this.constructionZone_width_px;
    const cz_y = 0;
    this.zoneMeshes.push(
      this.sceneManager.createZone(cz_x, cz_y, this.constructionZone_width_px, this.constructionZone_height_px, cz_color, 0.12)
    );

    // Target Berm Zone
    const tz_color = parseInt(this.targetbermZone_color.replace('#', ''), 16);
    const tz_x = this.environment.environment_width_px - this.constructionZone_width_px/2 - this.targetbermZone_width_px/2;
    const tz_y = this.constructionZone_height_px/8;
    this.zoneMeshes.push(
      this.sceneManager.createZone(tz_x, tz_y, this.targetbermZone_width_px, this.targetbermZone_height_px, tz_color, 0.5)
    );

    // Column Post (as a physical obstacle)
    const cp_x = this.environment.environment_width_px/2;
    const cp_y = this.environment.environment_height_px/2;
    this.columnMesh = this.sceneManager.createColumnPost(cp_x, cp_y, this.columnZone_width_px, this.columnZone_height_px);
  }

  // Update Three.js objects (called from animation loop)
  updateThree() {
    // Update zone positions if needed (e.g., on window resize)
    if (this.sceneManager && this.zoneMeshes.length > 0) {
      // Update zone sizes based on current pixel dimensions
      // This is handled by the scene manager's camera update
    }
  }
}
