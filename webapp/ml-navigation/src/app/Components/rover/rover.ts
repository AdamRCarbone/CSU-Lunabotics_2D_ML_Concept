// app/Components/rover/rover.ts
import { Component, inject } from '@angular/core';
import { EnvironmentComponent } from '../../../environment/environment';
import p5 from 'p5';

@Component({
  selector: 'app-rover',
  standalone: true,
  template: '', // rendering handled by p5
  styleUrls: ['./rover.css']
})
export class RoverComponent {
  // Inject EnvironmentComponent to access shared properties
  environment = inject(EnvironmentComponent);
  window_width = this.environment.environment_width;
  window_height = this.environment.environment_height;

  //Grid Properties
  grid_size = this.environment.grid_size;
  cell = this.environment.cell_size;

  //Rover Variables
  Rover_Stroke_Thickness = 0.25 * this.cell;
  Rover_Stroke_Color = 20;

  Rover_Width = this.cell*3;
  Rover_Height = this.cell*5;
  Rover_Radius = this.cell*0.5;
  Rover_Origin_X = this.Rover_Width/2;
  Rover_Origin_Y = this.Rover_Height/2;

  //Wheel Variables
  Wheel_Width = this.Rover_Width / 4;
  Wheel_Height = this.Rover_Height / 4;

  Wheel_Left_X = -(3 / 4) * this.Rover_Width;
  Wheel_Right_X = (1 / 2) * this.Rover_Width;

  Wheel_Front_Y = -this.Rover_Height / 2;
  Wheel_Middle_Y = -this.Rover_Height / 8;
  Wheel_Back_Y = this.Rover_Height / 4;

  //Bucket Variables
  Bucket_Width = this.Rover_Width*1.375;
  Bucket_Height = this.Rover_Height / 5;
  Bucket_X = -this.Bucket_Width / 2
  Bucket_Y = -this.Rover_Height/1.25;
  Bucket_Top_Radius = this.Rover_Radius / 4;
  Bucket_Bottom_Radius = this.Rover_Radius*1.5;
  
  Bucket_Arm_Width = this.Bucket_Height/2.5;
  Bucket_Arm_Height = this.Bucket_Height * 1.5;
  Bucket_Arm_Left_X = -this.Bucket_Width / 5;
  Bucket_Arm_Right_X = -this.Bucket_Arm_Left_X - this.Bucket_Arm_Width
  Bucket_Arm_Y = -this.Rover_Height / 2 - this.Bucket_Arm_Height / 1.5;
  

  //Rover State
  private x: number = this.window_width / 2;
  private y: number = this.window_height / 2;
  private theta: number = 0; // Angle in degrees
  private speed: number = 0.1 * this.cell; // Pixels per frame
  private turnSpeed: number = 1; // Degrees per frame
  private pressedKeys = new Set<string>();

  update(p: p5) {
    if (this.pressedKeys.has('w')) {
      this.x += this.speed * p.sin(this.theta);
      this.y -= this.speed * p.cos(this.theta);
    }
    if (this.pressedKeys.has('s')) {
      this.x -= this.speed * p.sin(this.theta);
      this.y += this.speed * p.cos(this.theta);
    }
    if (this.pressedKeys.has('a')) {
      this.theta -= this.turnSpeed;
    }
    if (this.pressedKeys.has('d')) {
      this.theta += this.turnSpeed;
    }
  }

draw(p: p5) {
    p.push();
    p.translate(this.x + this.Rover_Origin_X, this.y + this.Rover_Origin_Y); // Center of rover
    p.rotate(this.theta); // Make sure p.angleMode(p.DEGREES) is set in your sketch!
    
    //Rover Body
    p.fill(100, 100, 100);
    p.strokeWeight(this.Rover_Stroke_Thickness);
    p.stroke(this.Rover_Stroke_Color);
    // Correctly centered rover body (using -Height/2)
    p.rect(-this.Rover_Width/2, -this.Rover_Height/2, this.Rover_Width, this.Rover_Height, this.Rover_Radius); 
    
    //Wheels
    p.fill(25, 25, 25);
    p.strokeWeight(this.Rover_Stroke_Thickness);
    p.stroke(this.Rover_Stroke_Color);
    // Wheel 1 - Front Left
    p.rect(this.Wheel_Left_X, this.Wheel_Front_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    // Wheel 2 - Middle Left
    p.rect(this.Wheel_Left_X, this.Wheel_Middle_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    // Wheel 3 - Back Left
    p.rect(this.Wheel_Left_X, this.Wheel_Back_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    // Wheel 4 - Front Right
    p.rect(this.Wheel_Right_X, this.Wheel_Front_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    // Wheel 5 - Middle Right
    p.rect(this.Wheel_Right_X, this.Wheel_Middle_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);
    // Wheel 6 - Back Right
    p.rect(this.Wheel_Right_X, this.Wheel_Back_Y, this.Wheel_Width, this.Wheel_Height, this.Rover_Radius);

    //Front Digging Bucket
    p.fill(150, 150, 150);
    p.strokeWeight(this.Rover_Stroke_Thickness);
    p.stroke(this.Rover_Stroke_Color);
    // Bucket Arms
    p.rect(this.Bucket_Arm_Left_X, this.Bucket_Arm_Y, this.Bucket_Arm_Width, this.Bucket_Arm_Height, this.Rover_Radius);
    p.rect(this.Bucket_Arm_Right_X, this.Bucket_Arm_Y, this.Bucket_Arm_Width, this.Bucket_Arm_Height, this.Rover_Radius);
    // Bucket Main Body
    p.rect(this.Bucket_X, this.Bucket_Y, this.Bucket_Width, this.Bucket_Height, this.Bucket_Top_Radius, this.Bucket_Top_Radius, this.Bucket_Bottom_Radius, this.Bucket_Bottom_Radius);
    
    p.pop();
  }

  keyPressed(event: KeyboardEvent) {
    this.pressedKeys.add(event.key.toLowerCase());
  }

  keyReleased(event: KeyboardEvent) {
    this.pressedKeys.delete(event.key.toLowerCase());
  }
}