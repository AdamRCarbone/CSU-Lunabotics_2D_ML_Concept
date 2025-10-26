// src/app/environment/environment.component.ts
import { Component, ElementRef, OnInit, OnDestroy, ViewChild, Input, effect } from '@angular/core';
import { RoverComponent } from '../app/Components/rover/rover';
import { WindowSizeService } from '../app/services/window-size';
import p5 from 'p5';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-environment',
  standalone: true,
  imports: [RoverComponent],
  template: `
    <div #canvasContainer></div>
    <app-rover #rover></app-rover>
  `,
  styleUrls: ['./environment.css']
})
export class EnvironmentComponent implements OnInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef;
  @ViewChild('rover', { static: true }) rover!: RoverComponent;

  @Input() set roverSpeedMultiplier(value: number) {
    if (this.rover) {
      this.rover.speedMultiplier = value;
    }
  }
  private p5Instance!: p5;
  private windowSizeSubscription!: Subscription;

  public environment_width: number;
  public environment_height: number;
  public grid_size = 50;
  public cell_size: number;
  public environment_border_radius: number;
  public environment_stroke_weight: number;
  public rover_start_x: number;
  public rover_start_y: number;

  constructor(private windowSizeService: WindowSizeService) {
    // Initialize with current window size
    const { width, height } = this.windowSizeService.windowSizeSubject.getValue();
    this.environment_width = height / 1.5;
    this.environment_height = height / 1.5;
    this.cell_size = this.environment_height / this.grid_size;
    this.environment_border_radius = this.cell_size / 2.5;
    this.environment_stroke_weight = this.cell_size / 2;
    this.rover_start_x = this.environment_width / 8;
    this.rover_start_y = this.environment_height / 1.15;
  }

  ngOnInit() {
    // Subscribe to window size changes
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(({ width, height }) => {
      this.environment_width = height / 1.5;
      this.environment_height = height / 1.5;
      this.cell_size = this.environment_height / this.grid_size;
      this.environment_border_radius = this.cell_size / 2.5;
      this.environment_stroke_weight = this.cell_size / 2;

      // Resize the p5.js canvas
      if (this.p5Instance) {
        this.p5Instance.resizeCanvas(this.environment_width, this.environment_height);
      }
    });

    // Initialize p5.js
    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(this.environment_width, this.environment_height);
        canvas.parent(this.canvasContainer.nativeElement);
        p.angleMode(p.DEGREES);
      };

      p.draw = () => {
        p.fill(220);
        p.stroke(150);

        const sw = this.environment_stroke_weight;
        p.strokeWeight(sw);
        const strokeOffset = sw / 2;

        const rectX = strokeOffset;
        const rectY = strokeOffset;

        const rectW = this.environment_width - sw;
        const rectH = this.environment_height - sw;
        const borderRadius = this.environment_border_radius * 5;

        // Adjusted rectangle
        p.rect(rectX, rectY, rectW, rectH, borderRadius);

        this.rover.update(p); // Update rover
        this.rover.draw(p);   // Render rover
      };

      p.keyPressed = (event: KeyboardEvent) => {
        this.rover.keyPressed(event);
      };

      p.keyReleased = (event: KeyboardEvent) => {
        this.rover.keyReleased(event);
      };
    });
  }

  ngOnDestroy() {
    if (this.p5Instance) {
      this.p5Instance.remove();
    }
    if (this.windowSizeSubscription) {
      this.windowSizeSubscription.unsubscribe();
    }
  }
}