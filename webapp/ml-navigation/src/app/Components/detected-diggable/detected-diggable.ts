import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DiggableObject {
  x_meters: number;
  y_meters: number;
  name?: string;
}

export interface DetectedDiggableData {
  name: string;
  x: string;
  y: string;
}

@Component({
  selector: 'app-detected-diggable',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detected-diggable.html',
  styleUrl: './detected-diggable.css'
})
export class DetectedDiggableComponent {
  @Input() diggables: DiggableObject[] = [];

  get detectedDiggables(): DetectedDiggableData[] {
    const maxDiggables = 4;
    const detected: DetectedDiggableData[] = this.diggables.map(obj => {
      const name = obj.name?.split('_')[0] || 'Regolith';

      return {
        name: name,
        x: obj.x_meters.toFixed(2),
        y: obj.y_meters.toFixed(2)
      };
    });

    // Fill remaining slots with empty rows
    while (detected.length < maxDiggables) {
      detected.push({
        name: '—',
        x: '—',
        y: '—'
      });
    }

    return detected.slice(0, maxDiggables);
  }
}
