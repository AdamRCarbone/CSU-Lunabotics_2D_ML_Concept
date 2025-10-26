// environment/environment.component.ts
import { Component, ElementRef, OnInit, OnDestroy, ViewChild, inject } from '@angular/core';
import { App } from '../app/app';
import { RoverComponent } from '../app/Components/rover/rover';
import p5 from 'p5';

@Component({
  selector: 'app-environment',
  standalone: true,
  imports: [RoverComponent],
  template: `
    <div #canvasContainer></div>
    <app-rover #rover></app-rover>
  `,
  styleUrls: ['./environment.css'] // Adjusted path if needed
})

export class EnvironmentComponent implements OnInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef;
  @ViewChild('rover', { static: true }) rover!: RoverComponent;
  private p5Instance!: p5;
  App = inject(App);


  public environment_width = this.App.window_width/1.5;
  public environment_height =this.App.window_width/1.5;
  public grid_size = 50;
  public cell_size = this.environment_height/this.grid_size
  public environment_border_radius = this.cell_size/2.5;
  public environment_stroke_weight = this.cell_size/2;

  ngOnInit() {
    this.p5Instance = new p5((p: p5) => {

      p.setup = () => {
        //make canvas fill parent container
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
    
    //adjusted rectangle
    p.rect(rectX, rectY, rectW, rectH, borderRadius);
    
    this.rover.update(p); // Update rover
    this.rover.draw(p);   // Render rover
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
  }
}