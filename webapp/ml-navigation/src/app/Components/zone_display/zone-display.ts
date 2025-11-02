import { Component, inject } from '@angular/core';
import p5, { Color } from 'p5';
import { Subscription } from 'rxjs';
import { EnvironmentComponent } from '../../../environment/environment';
import { WindowSizeService } from '../../../app/services/window-size';
import { App } from '../../app';
import { CollidableObject, CollisionShape } from '../collidable-object/collidable-object';


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
  private p5Instance!: p5;
  private windowSizeSubscription!: Subscription;

  //Starting Zone
  public startingZone_width_meters: number = 2;
  public startingZone_height_meters: number = 2;
  public startingZone_width_px!: number;
  public startingZone_height_px!: number;
  public startingZone_color: string = '#69D140';

  // Collidable objects in the environment
  public collidableObjects: CollidableObject[] = [];

  //Excavation Zone
  public excavationZone_width_meters: number = 2.5;
  public excavationZone_height_meters: number = this.environment.environment_height_meters;
  public excavationZone_width_px!: number;
  public excavationZone_height_px!: number;
  public excavationZone_color: string = '#4099d1';

  //Obstacle Zone
  public obstacleZone_width_meters: number = 4.38;
  public obstacleZone_height_meters: number = this.environment.environment_height_meters;
  public obstacleZone_width_px!: number;
  public obstacleZone_height_px!: number;
  public obstacleZone_color: string = '#ffcb5c';

  //Construction Zone
  public constructionZone_width_meters: number = 3;
  public constructionZone_height_meters: number = 1.5;
  public constructionZone_width_px!: number;
  public constructionZone_height_px!: number;
  public constructionZone_color: string = '#ffa43d';

  //Target Berm Zone
  public targetbermZone_width_meters: number = 1.7;
  public targetbermZone_height_meters: number = 0.8;
  public targetbermZone_width_px!: number;
  public targetbermZone_height_px!: number;
  public targetbermZone_color: string = '#ff3609';

  //Column Post Zone
  public columnZone_width_meters: number = 0.75;
  public columnZone_height_meters: number = 0.75;
  public columnZone_width_px!: number;
  public columnZone_height_px!: number;
  public columnZone_color: string = '#ff0000';

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

  update(p: p5) {}

  draw(p: p5) {
    p.push();

    //Stroke Parameters
    const sw = this.environment.environment_stroke_weight_px;
    p.strokeWeight(sw*.8);
    const strokeOffset = sw/2;
    const stroke_weight_comp = 1.25*sw;


    //Column Post Zone
    const color_pz = this.columnZone_color;
    const rgb_pz = this.app.hexToRgb(color_pz) ?? { r: 0, g: 0, b: 0 };
    const r_pz = rgb_pz.r;
    const g_pz = rgb_pz.g;
    const b_pz = rgb_pz.b;
    const x_pos_pz = this.environment.environment_width_px/2 - this.columnZone_height_px/2;
    const y_pos_pz =  this.environment.environment_height_px/2 - this.columnZone_width_px/2;

    p.stroke(r_pz, g_pz, b_pz, 255/2);
    p.fill(r_pz, g_pz, b_pz, 255/2);
    p.rect(x_pos_pz, y_pos_pz, this.columnZone_width_px, this.columnZone_height_px, this.environment.environment_border_radius_px/2);


    //Target Berm Zone
    const color_tz = this.targetbermZone_color;
    const rgb_tz = this.app.hexToRgb(color_tz) ?? { r: 0, g: 0, b: 0 };
    const r_tz = rgb_tz.r;
    const g_tz = rgb_tz.g;
    const b_tz = rgb_tz.b;
    const x_pos_tz = stroke_weight_comp + strokeOffset + this.environment.environment_width_px - this.constructionZone_width_px/2 - this.targetbermZone_width_px/2;
    const y_pos_tz = this.environment.environment_height_px - this.targetbermZone_height_px - this.constructionZone_height_px/8;

    p.stroke(r_tz, g_tz, b_tz, 255/2);
    p.fill(r_tz, g_tz, b_tz, 255/2);
    p.rect(x_pos_tz, strokeOffset + y_pos_tz, this.targetbermZone_width_px - stroke_weight_comp, this.targetbermZone_height_px , this.environment.environment_border_radius_px);


    //Construction Zone
    const color_cz = this.constructionZone_color;
    const rgb_cz = this.app.hexToRgb(color_cz) ?? { r: 0, g: 0, b: 0 };
    const r_cz = rgb_cz.r;
    const g_cz = rgb_cz.g;
    const b_cz = rgb_cz.b;
    const x_pos_cz = stroke_weight_comp + strokeOffset + this.environment.environment_width_px - this.constructionZone_width_px;
    const y_pos_cz = this.environment.environment_height_px - this.constructionZone_height_px;

    p.stroke(r_cz, g_cz, b_cz, 255);
    p.fill(r_cz, g_cz, b_cz, 30);
    p.rect(x_pos_cz, strokeOffset + y_pos_cz, this.constructionZone_width_px - stroke_weight_comp, this.constructionZone_height_px , this.environment.environment_border_radius_px);


    //Obstacle Zone
    const color_oz = this.obstacleZone_color;
    const rgb_oz = this.app.hexToRgb(color_oz) ?? { r: 0, g: 0, b: 0 };
    const r_oz = rgb_oz.r;
    const g_oz = rgb_oz.g;
    const b_oz = rgb_oz.b;
    const x_pos_oz = this.environment.environment_width_px - this.obstacleZone_width_px;
    const y_pos_oz = this.environment.environment_height_px - this.obstacleZone_height_px;

    p.stroke(r_oz, g_oz, b_oz, 255);
    p.fill(r_oz, g_oz, b_oz, 30);
    p.rect(x_pos_oz + strokeOffset + stroke_weight_comp, strokeOffset + y_pos_oz, this.obstacleZone_width_px - stroke_weight_comp, this.obstacleZone_height_px, this.environment.environment_border_radius_px);


    //Excavation Zone
    const color_ez = this.excavationZone_color;
    const rgb_ez = this.app.hexToRgb(color_ez) ?? { r: 0, g: 0, b: 0 };
    const r_ez = rgb_ez.r;
    const g_ez = rgb_ez.g;
    const b_ez = rgb_ez.b;
    const y_pos_ez = this.environment.environment_height_px - this.excavationZone_height_px;

    p.stroke(r_ez, g_ez, b_ez, 255);
    p.fill(r_ez, g_ez, b_ez, 30);
    p.rect(strokeOffset, strokeOffset + y_pos_ez, this.excavationZone_width_px - stroke_weight_comp, this.excavationZone_height_px, this.environment.environment_border_radius_px);


    //Starting Zone
    const color_sz = this.startingZone_color;
    const rgb_sz = this.app.hexToRgb(color_sz) ?? { r: 0, g: 0, b: 0 };
    const r_sz = rgb_sz.r;
    const g_sz = rgb_sz.g;
    const b_sz = rgb_sz.b;
    const y_pos_sz = this.environment.environment_height_px - this.startingZone_height_px;

    p.stroke(r_sz, g_sz, b_sz, 255);
    p.fill(r_sz, g_sz, b_sz, 50);
    p.rect(strokeOffset, strokeOffset + y_pos_sz, this.startingZone_width_px - stroke_weight_comp, this.startingZone_height_px , this.environment.environment_border_radius_px);

    
    p.pop();
  }
}
