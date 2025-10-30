import { Component, OnInit, OnDestroy, Input, ChangeDetectorRef } from '@angular/core';
import { EnvironmentComponent } from '../../../environment/environment';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-position-display',
  imports: [DecimalPipe],
  templateUrl: './position-display.html',
  styleUrl: './position-display.css'
})
export class PositionDisplay {
  @Input() environment?: EnvironmentComponent;
  @Input() color: string = '#1a73e8';
  @Input() pillBgOpacity: number = 0.08;

  private positionUpdateInterval: any;

  constructor(private cdr: ChangeDetectorRef) {}

  get pillBackground(): string {
    const hex = this.color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${this.pillBgOpacity})`;
  }

  ngOnInit() {
    // Example: manually check every 100ms
    this.positionUpdateInterval = setInterval(() => {
      this.cdr.detectChanges();
    }, 100);
  }

  ngOnDestroy() {
    clearInterval(this.positionUpdateInterval);
  }
}