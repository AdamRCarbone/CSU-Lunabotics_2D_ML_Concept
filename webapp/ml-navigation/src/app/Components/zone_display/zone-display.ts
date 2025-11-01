import { Component, inject } from '@angular/core';
import p5, { Color } from 'p5';
import { Subscription } from 'rxjs';
import { EnvironmentComponent } from '../../../environment/environment';
import { WindowSizeService } from '../../../app/services/window-size';
import { App } from '../../app';


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

  ngOnInit() {
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
    });
  }

  update(p: p5) {}

  draw(p: p5) {
    p.push();

    const sw = this.environment.environment_stroke_weight_px;
    p.strokeWeight(sw*.8);
    const strokeOffset = sw/2;
    const stroke_weight_comp = 1.25*sw;


    //Obstacle Zone
    const color_oz = this.obstacleZone_color;
    const rgb_oz = this.app.hexToRgb(color_oz) ?? { r: 0, g: 0, b: 0 };
    const r_oz = rgb_oz.r;
    const g_oz = rgb_oz.g;
    const b_oz = rgb_oz.b;
    const y_pos_oz = this.environment.environment_height_px - this.obstacleZone_height_px;
    const x_pos_oz = this.environment.environment_width_px - this.obstacleZone_width_px;

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
