import { Component, inject } from '@angular/core';
import p5, { Color } from 'p5';
import { Subscription } from 'rxjs';
import { EnvironmentComponent } from '../../../environment/environment';
import { WindowSizeService } from '../../../app/services/window-size';
import { App } from '../../app';
import { CollidableObject, CollisionShape } from '../collidable-object/collidable-object';
import { ZONE_COLORS } from '../zone-legend/zone-legend';
import { Zone } from '../../enums/zone.enum';
import { KSC_ARENA, UCF_ARENA, ArenaLayout } from '../../models/arena-config.model';


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

  private windowSizeSubscription!: Subscription;

  // Active arena layout — swap to switch between KSC and UCF
  public arenaLayout: ArenaLayout = KSC_ARENA;

  // Collidable objects in the environment
  public collidableObjects: CollidableObject[] = [];

  // Zone colors
  public startingZone_color:    string = ZONE_COLORS.startingZone;
  public excavationZone_color:  string = ZONE_COLORS.excavationZone;
  public constructionZone_color:string = ZONE_COLORS.constructionZone;
  public targetbermZone_color:  string = ZONE_COLORS.targetBermZone;
  public columnZone_color:      string = ZONE_COLORS.columnPostZone;

  // Legacy accessors used by obstacle-field and rover spawn
  get startingZone_width_meters():  number { return this.arenaLayout.start.w; }
  get startingZone_height_meters(): number { return this.arenaLayout.start.h; }

  // Zone detection
  public currentZone: Zone = Zone.NONE;
  public previousZone: Zone = Zone.NONE;

  /** Switch the active arena layout and reinitialise collidable objects. */
  setArena(layout: ArenaLayout): void {
    this.arenaLayout = layout;
    this.environment.environment_width_meters  = layout.width;
    this.environment.environment_height_meters = layout.length;
    this.initializeCollidableObjects();
  }

  ngOnInit() {
    this.initializeCollidableObjects();
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(() => {
      // pixel values are derived on-the-fly in draw(); nothing to cache here
    });
  }

  private initializeCollidableObjects() {
    this.collidableObjects = [];
    const col = this.arenaLayout.column;
    if (col) {
      this.collidableObjects.push(new CollidableObject({
        x_meters:      col.x + col.w / 2,
        y_meters:      col.y + col.h / 2,
        shape:         CollisionShape.RECTANGLE,
        width_meters:  col.w,
        height_meters: col.h,
        color:         this.columnZone_color,
        name:          'Post',
      }));
    }
  }

  detectRoverZone(roverX_meters: number, roverY_meters: number): Zone {
    const al = this.arenaLayout;

    const inRect = (rx: number, ry: number, z: { x: number; y: number; w: number; h: number }) =>
      rx >= z.x && rx <= z.x + z.w && ry >= z.y && ry <= z.y + z.h;

    if (inRect(roverX_meters, roverY_meters, al.berm))       return Zone.TARGET_BERM;
    if (inRect(roverX_meters, roverY_meters, al.deposit))    return Zone.CONSTRUCTION;
    if (inRect(roverX_meters, roverY_meters, al.start))      return Zone.STARTING;
    if (inRect(roverX_meters, roverY_meters, al.excavation)) return Zone.EXCAVATION;
    return Zone.NONE;
  }

  update(p: p5) {
    // Get rover position
    if (this.environment.rover) {
      const roverState = this.environment.physicsEngine.getRoverState();
      if (roverState) {
        // Convert rover position from pixels to meters
        const roverX_meters = this.environment.pixelsToMeters(roverState.x);
        const roverY_meters = this.environment.pixelsToMeters(this.environment.environment_height_px - roverState.y);

        // Detect current zone
        this.previousZone = this.currentZone;
        this.currentZone = this.detectRoverZone(roverX_meters, roverY_meters);

        // Update rover's currentZone property
        this.environment.rover.currentZone = this.currentZone;

        // Log zone changes
        if (this.currentZone !== this.previousZone) {
          console.log(`Rover entered zone: ${this.currentZone}`);
        }
      }
    }
  }

  draw(p: p5) {
    const al  = this.arenaLayout;
    const env = this.environment;
    const sw  = env.environment_stroke_weight_px;
    const so  = sw / 2;
    const br  = env.environment_border_radius_px;
    const m2p = (m: number) => env.metersToPixels(m);

    // Convert a world rect (metres, y=0 at bottom) to canvas rect (y=0 at top)
    const zRect = (z: { x: number; y: number; w: number; h: number }) => ({
      px: m2p(z.x) + so,
      py: env.environment_height_px - m2p(z.y + z.h) + so,
      pw: m2p(z.w),
      ph: m2p(z.h),
    });

    const drawZone = (z: typeof al.excavation, hexColor: string, fillAlpha: number) => {
      const { px, py, pw, ph } = zRect(z);
      const rgb = this.app.hexToRgb(hexColor) ?? { r: 128, g: 128, b: 128 };
      p.stroke(rgb.r, rgb.g, rgb.b, 255);
      p.fill(rgb.r, rgb.g, rgb.b, fillAlpha);
      p.rect(px, py, pw, ph, br);
    };

    p.push();
    p.strokeWeight(sw * 0.8);

    drawZone(al.excavation, this.excavationZone_color,  30);
    drawZone(al.deposit,    this.constructionZone_color, 30);
    drawZone(al.start,      this.startingZone_color,     50);
    drawZone(al.berm,       this.targetbermZone_color,  120);

    // Column post (KSC only)
    if (al.column) {
      const { px, py, pw, ph } = zRect(al.column);
      p.stroke(150, 150, 150, 255);
      p.fill(255, 255, 255, 255);
      p.rect(px, py, pw, ph, br / 2);
    }

    p.pop();
  }
}

