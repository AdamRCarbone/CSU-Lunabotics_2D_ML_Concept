// src/app/app.component.ts
import { Component, HostListener, ViewChild, AfterViewInit, ChangeDetectorRef, NgZone, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EnvironmentComponent } from '../environment/environment';
import { WindowSizeService } from './services/window-size';
import { UniversalSliderComponent } from './Components/universal_slider/universal-slider';
import { ParameterDisplay, Parameter } from "./Components/parameter_display/parameter-display";
import { ZoneLegend } from './Components/zone-legend/zone-legend';
import { Zone } from './enums/zone.enum';
import { ResetTrigger } from './services/reset-trigger';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { CollidableObject } from './Components/collidable-object/collidable-object';
import { TrainingPanelComponent } from './Components/training-panel/training-panel';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, EnvironmentComponent, UniversalSliderComponent, ParameterDisplay, ZoneLegend, CommonModule, TrainingPanelComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild(EnvironmentComponent) environment!: EnvironmentComponent;

  title = 'ml-navigation';
  public window_width = window.innerWidth;
  public window_height = window.innerHeight;

  // Differential drive motor values (slider-commanded)
  public leftMotorValue: number = 0;
  public rightMotorValue: number = 0;

  // Speed multiplier: 100 = 0.2 m/s nominal, range 0–500%
  public speedMultiplierPercent: number = 100;

  // Actual motor values (read from rover, shown in display bars)
  public leftMotorActual: number = 0;
  public rightMotorActual: number = 0;

  public positionParams: Parameter[] = [
    { name: 'x', value: '—' },
    { name: 'y', value: '—' }
  ];
  public positionParams_sigfig: number = 3;
  public currentZone: Zone = Zone.NONE;

  // Bucket state: 0=UP (travel), 1=COLLECT (digging), 2=DUMP
  public bucketState: number = 0;
  public bucketParams: Parameter[] = [{ name: 'Bucket', value: 'UP' }];
  private readonly BUCKET_LABELS = ['UP', 'COLLECT', 'DUMP'];

  private resetSubscription?: Subscription;

  constructor(
    private windowSizeService: WindowSizeService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private resetTrigger: ResetTrigger
  ) {
    this.windowSizeService.updateWindowSize(this.window_width, this.window_height);
  }

  getRoverPositionMeters(axis: 'x' | 'y'): string {
    if (!this.environment?.physicsEngine) return '—';
    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return '—';
    const value = axis === 'x'
      ? this.environment.pixelsToMeters(state.x)
      : this.environment.environment_height_meters - this.environment.pixelsToMeters(state.y);
    return value.toFixed(this.positionParams_sigfig);
  }

  updateRoverPosition() {
    this.positionParams = [
      { name: 'x', value: this.getRoverPositionMeters('x') },
      { name: 'y', value: this.getRoverPositionMeters('y') }
    ];
  }

  /** Groups of obstacles for the sensor inputs panel. */
  get sensorGroups(): { type: string; items: CollidableObject[] }[] {
    const all = this.environment?.obstacleField?.collidableObjects || [];
    const rocks    = all.filter(o => o.name.startsWith('Rock'));
    const craters  = all.filter(o => o.name.startsWith('Crater'));
    const boundary = all.filter(o => ['Wall_N','Wall_S','Wall_E','Wall_W'].includes(o.name));
    return [
      { type: 'Rocks',    items: rocks    },
      { type: 'Craters',  items: craters  },
      { type: 'Boundary', items: boundary },
    ].filter(g => g.items.length > 0);
  }

  public hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    hex = hex.replace(/^#/, '');
    if (hex.length !== 6 || !/^[0-9A-Fa-f]{6}$/.test(hex)) return null;
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
    };
  }

  public randomInRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  /** Returns bar fill width (0–50%) for a motor value in [-1, 1]. */
  motorBarWidth(v: number): number { return Math.abs(v) * 50; }
  motorBarForward(v: number): boolean { return v >= 0; }

  ngAfterViewInit() {
    this.updateRoverPosition();
    this.resetBucket();

    this.resetSubscription = this.resetTrigger.reset$.subscribe(() => {
      this.resetBucket();
    });

    this.ngZone.runOutsideAngular(() => {
      setInterval(() => {
        if (this.environment) {
          this.ngZone.run(() => {
            const newLeft  = this.environment.roverCurrentLeftMotor;
            const newRight = this.environment.roverCurrentRightMotor;

            if (Math.abs(this.leftMotorActual  - newLeft)  > 0.005 ||
                Math.abs(this.rightMotorActual - newRight) > 0.005) {
              this.leftMotorActual  = newLeft;
              this.rightMotorActual = newRight;
            }

            if (this.environment.rover) {
              this.updateRoverPosition();
              this.currentZone = this.environment.currentZone;
              this.cdr.markForCheck();
            }
          });
        }
      }, 50);
    });
  }

  ngOnDestroy() {
    this.resetSubscription?.unsubscribe();
  }

  resetBucket() {
    this.bucketState = 0;
    this.bucketParams = [{ name: 'Bucket', value: 'UP' }];
    if (this.environment?.diggingField) {
      this.environment.diggingField.setDigMode(false);
    }
  }

  private lastKeyPressTime: number = 0;

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'b' || event.key === 'B') {
      const now = Date.now();
      if (now - this.lastKeyPressTime < 200) return;
      this.lastKeyPressTime = now;
      this.cycleBucket();
    }
  }

  cycleBucket() {
    if (!this.environment?.diggingField) return;
    this.bucketState = (this.bucketState + 1) % 3;
    this.bucketParams = [{ name: 'Bucket', value: this.BUCKET_LABELS[this.bucketState] }];

    if (this.bucketState === 1) {
      this.environment.diggingField.setDigMode(true);
    } else {
      this.environment.diggingField.setDigMode(false);
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event) {
    this.window_width = window.innerWidth;
    this.window_height = window.innerHeight;
    this.windowSizeService.updateWindowSize(this.window_width, this.window_height);
  }
}
