import { Component, inject } from '@angular/core';
import { RoverComponent } from '../../../app/Components/rover/rover';
import p5, { Color } from 'p5';
import { Subscription } from 'rxjs';
import { EnvironmentComponent } from '../../../environment/environment';
import { WindowSizeService } from '../../../app/services/window-size';


@Component({
  selector: 'app-zone-display',
  imports: [],
  templateUrl: './zone-display.html',
  styleUrl: './zone-display.css',
})
export class ZoneDisplay {
  environment = inject(EnvironmentComponent);
  windowSizeService = inject(WindowSizeService)

  //2x2m region in bottom left of environment
  private p5Instance!: p5;
  private windowSizeSubscription!: Subscription;

  public startingZone_width_meters: number = 2;
  public startingZone_height_meters: number = 2;
  public startingZone_width_px!: number;
  public startingZone_height_px!: number;

  ngOnInit() {
    // Subscribe to window size changes
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {
      this.startingZone_width_px = (this.environment.environment_width_px/this.environment.environment_width_meters)*this.startingZone_width_meters
      this.startingZone_height_px = (this.environment.environment_height_px/this.environment.environment_height_meters)*this.startingZone_height_meters

    });
  }

  update(p: p5) {}

  draw(p: p5) {
    p.push();

    p.stroke(175, 254, 144)

    const sw = this.environment.environment_stroke_weight_px;
    p.strokeWeight(sw);
    const strokeOffset = sw / 2;

    const rectX = strokeOffset;
    const rectY = strokeOffset;

    const rectW = this.environment.environment_width_px - sw;
    const rectH = this.environment.environment_height_px - sw;
    const borderRadius = this.environment.environment_border_radius_px;

    // Adjusted rectangle
    p.rect(rectX/2, rectY/2, rectW/2, rectH/2, borderRadius);

    p.pop();
  }
}
