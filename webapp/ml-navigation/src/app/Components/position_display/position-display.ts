import { Component, ElementRef, OnInit, OnDestroy, ViewChild, Input } from '@angular/core';
import { EnvironmentComponent } from '../../../environment/environment';
import { WindowSizeService } from '../../services/window-size';
import { Subscription } from 'rxjs';
import p5 from 'p5';
import { ChangeDetectorRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-position-display',
  imports: [DecimalPipe],
  templateUrl: './position-display.html',
  styleUrl: './position-display.css',
})
export class PositionDisplay {
  @Input() environmentComponent!: EnvironmentComponent;

  width!: number;
  height!: number;
  private scaleFactor = 1 / 20;

  constructor(
    private windowSizeService: WindowSizeService,
    private cdr: ChangeDetectorRef
  ) {
    const { width, height } = this.windowSizeService.windowSizeSubject.getValue();
    this.width = width * this.scaleFactor;
    this.height = height * this.scaleFactor;
  }
  private positionUpdateInterval: any;

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