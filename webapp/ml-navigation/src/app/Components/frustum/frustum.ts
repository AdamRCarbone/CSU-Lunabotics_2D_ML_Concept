import { Component, inject, OnInit } from '@angular/core';
import { EnvironmentComponent } from '../../../environment/environment';
import p5 from 'p5';

@Component({
  selector: 'app-frustum',
  imports: [],
  templateUrl: './frustum.html',
  styleUrl: './frustum.css',
})
export class Frustum implements OnInit {
  environment = inject(EnvironmentComponent);

  // Frustum properties (configurable)
  public depth: number = 1.25; // Depth of frustum in meters
  public farWidth: number = 2; // Width at far end in meters
  public farRadius: number = 0.5; // Radius for rounded corners at far end in meters
  public color: string = '#8e4cff';
  public opacity: number = 50; // Opacity (0-255)

  ngOnInit() {
    // Component initialized
  }

  update(p: p5) {
    // Update logic if needed
  }

  draw(p: p5) {
    if (!this.environment.rover) return;

    const state = this.environment.physicsEngine.getRoverState();
    if (!state) return;

    const { x, y, angle } = state;

    // Get rover width from rover component
    const roverWidth = this.environment.rover.Rover_Width;
    const nearWidth = roverWidth; // Frustum starts at rover width

    // Convert meters to pixels
    const depthPx = this.environment.metersToPixels(this.depth);
    const farWidthPx = this.environment.metersToPixels(this.farWidth);
    const farRadiusPx = this.environment.metersToPixels(this.farRadius);

    // Parse color
    const rgb = this.environment.app.hexToRgb(this.color) ?? { r: 0, g: 255, b: 0 };

    p.push();
    p.translate(x, y);
    p.rotate(angle);

    // Draw frustum shape (trapezoid with rounded far edge)
    p.fill(rgb.r, rgb.g, rgb.b, this.opacity);
    p.stroke(rgb.r, rgb.g, rgb.b, this.opacity * 2);
    p.strokeWeight(1);

    // Define frustum points (trapezoid)
    // Near edge (at rover position, along rover width)
    const nearLeft = { x: -nearWidth / 2, y: 0 };
    const nearRight = { x: nearWidth / 2, y: 0 };

    // Far edge (at depth distance)
    const farLeft = { x: -farWidthPx / 2, y: -depthPx };
    const farRight = { x: farWidthPx / 2, y: -depthPx };

    // Draw the trapezoid with rounded far edge
    p.beginShape();
    p.vertex(nearLeft.x, nearLeft.y);
    p.vertex(nearRight.x, nearRight.y);

    // Right edge
    p.vertex(farRight.x, farRight.y);

    // Rounded far edge using arc/bezier approximation
    // Draw rounded edge from farRight to farLeft
    const numSegments = 16;
    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const curveAngle = Math.PI * t; // 180 degrees
      const rx = Math.cos(curveAngle) * (farWidthPx / 2);
      const ry = -depthPx - Math.sin(curveAngle) * farRadiusPx;
      p.vertex(rx, ry);
    }

    // Left edge back to start
    p.vertex(farLeft.x, farLeft.y);
    p.endShape(p.CLOSE);

    p.pop();
  }
}
