import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CollidableObject } from '../collidable-object/collidable-object';

export interface DetectedObstacle {
  name: string;
  x: string;
  y: string;
  r: string;
}

@Component({
  selector: 'app-detected-obstacles',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detected-obstacles.html',
  styleUrl: './detected-obstacles.css'
})
export class DetectedObstacles {
  @Input() obstacles: CollidableObject[] = [];

  get detectedObstacles(): DetectedObstacle[] {
    const maxObstacles = 4;
    const detected = this.obstacles.map(obj => {
      // Calculate radius (special handling for column post)
      let radius: number;
      if (obj.radius_meters) {
        radius = obj.radius_meters;
      } else if (obj.width_meters && obj.height_meters) {
        // Rectangular objects (column post): use sqrt(x^2 + y^2) / 2 as effective radius
        radius = Math.sqrt(obj.width_meters ** 2 + obj.height_meters ** 2) / 2;
      } else {
        radius = 0;
      }

      let name = obj.name?.split('_')[0] || 'Object';
      // Shorten "Column" to "Post"
      if (name === 'Column') {
        name = 'Post';
      }

      return {
        name: name,
        x: obj.x_meters.toFixed(2),
        y: obj.y_meters.toFixed(2),
        r: radius.toFixed(2)
      };
    });

    // Fill remaining slots with empty rows
    while (detected.length < maxObstacles) {
      detected.push({
        name: '—',
        x: '—',
        y: '—',
        r: '—'
      });
    }

    return detected.slice(0, maxObstacles);
  }
}
