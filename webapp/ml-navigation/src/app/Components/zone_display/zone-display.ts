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

  public startingZone_width_meters: number = 2;
  public startingZone_height_meters: number = 2;
  public startingZone_width_px!: number;
  public startingZone_height_px!: number;
  public startingZone_color: string = '#69D140';

  ngOnInit() {
    // Subscribe to window size changes
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {
      // Use centralized conversion function
      this.startingZone_width_px = this.environment.metersToPixels(this.startingZone_width_meters);
      this.startingZone_height_px = this.environment.metersToPixels(this.startingZone_height_meters);
    });
  }

  update(p: p5) {}

  draw(p: p5) {
    const color = this.startingZone_color;
    const rgb = this.app.hexToRgb(color) ?? { r: 0, g: 0, b: 0 };
    const r = rgb.r;
    const g = rgb.g;
    const b = rgb.b;

    p.push();

    p.stroke(r, g, b, 255);
    p.fill(r, g, b, 25);

    const sw = this.environment.environment_stroke_weight_px;
    p.strokeWeight(sw*.8);
    const strokeOffset = sw / 2;

    // Position zone in bottom-left corner
    const y_pos = this.environment.environment_height_px - this.startingZone_height_px;

    // Draw at exact dimensions - stroke will extend outside (centered on edge)
    p.rect(strokeOffset, strokeOffset + y_pos, this.startingZone_width_px, this.startingZone_height_px, this.environment.environment_border_radius_px);

    p.pop();
  }
}
