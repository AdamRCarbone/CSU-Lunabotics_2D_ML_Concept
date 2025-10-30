import { Component, Input } from '@angular/core';

export interface Parameter {
  name: string;
  value: string | number;
}

@Component({
  selector: 'app-parameter-display',
  imports: [],
  templateUrl: './parameter-display.html',
  styleUrl: './parameter-display.css'
})
export class ParameterDisplay {
  @Input() header: string = 'Parameters';
  @Input() parameters: Parameter[] = [];
  @Input() color: string = '#1a73e8';
  @Input() pillBgOpacity: number = 0.08;

  get pillBackground(): string {
    const hex = this.color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${this.pillBgOpacity})`;
  }
}
