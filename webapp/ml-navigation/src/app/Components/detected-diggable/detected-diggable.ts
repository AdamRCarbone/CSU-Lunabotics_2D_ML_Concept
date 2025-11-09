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
    const maxDiggables = 10;
    const detected: DetectedDiggableData[] = this.diggables.map(obj => {
      // Extract number from name like "Regolith_5" -> "5"
      const number = obj.name?.split('_')[1] || '?';

      return {
        name: number,
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
