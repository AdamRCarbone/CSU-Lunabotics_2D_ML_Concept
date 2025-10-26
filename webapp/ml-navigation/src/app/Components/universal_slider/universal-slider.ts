import { Component, Input, model, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WindowSizeService } from '../../services/window-size';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-universal-slider',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './universal-slider.html',
  styleUrls: ['./universal-slider.css']
})
export class UniversalSliderComponent implements OnInit, OnDestroy {
  @Input() min: number = 0;
  @Input() max: number = 100;
  @Input() step: number = 1;
  @Input() orientation: 'horizontal' | 'vertical' = 'horizontal';
  @Input() label?: string;
  @Input() showValue: boolean = true;
  @Input() heightPercent?: number; // 0-100 percentage of window height

  // Customization
  @Input() color: string = '#1a73e8'; // Main accent color for thumb and pills
  @Input() thumbSize: number = 20;
  @Input() trackSize: number = 5;
  @Input() trackColor: string = '#e8eaed';
  @Input() pillBgOpacity: number = 0.08;

  value = model<number>(0);
  private windowHeight = signal<number>(window.innerHeight);
  private windowSizeSubscription?: Subscription;

  constructor(private windowSizeService: WindowSizeService) {}

  ngOnInit() {
    this.windowSizeSubscription = this.windowSizeService.windowSize$.subscribe(size => {
      this.windowHeight.set(size.height);
    });
  }

  ngOnDestroy() {
    this.windowSizeSubscription?.unsubscribe();
  }

  get isVertical(): boolean {
    return this.orientation === 'vertical';
  }

  get thumbSizePx(): string {
    return `${this.thumbSize}px`;
  }

  get trackSizePx(): string {
    return `${this.trackSize}px`;
  }

  get thumbOffset(): string {
    return `-${(this.thumbSize - this.trackSize) / 2}px`;
  }

  get pillBackground(): string {
    const hex = this.color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${this.pillBgOpacity})`;
  }

  get thumbColor(): string {
    return this.color;
  }

  get containerHeight(): string | undefined {
    if (!this.heightPercent) return undefined;
    const heightPx = (this.heightPercent / 100) * this.windowHeight();
    return `${heightPx}px`;
  }
}