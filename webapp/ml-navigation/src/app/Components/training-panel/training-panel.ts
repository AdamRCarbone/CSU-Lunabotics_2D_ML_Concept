import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ViewChild, ElementRef, ChangeDetectorRef, NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TrainingService, TrainingStatus } from '../../services/training/training.service';

@Component({
  selector: 'app-training-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './training-panel.html',
})
export class TrainingPanelComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('lossCanvas') lossCanvas!: ElementRef<HTMLCanvasElement>;

  status: TrainingStatus | null = null;
  connected = false;

  private _subs: Subscription[] = [];

  constructor(
    private trainingService: TrainingService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit() {
    this._subs.push(
      this.trainingService.status$.subscribe(s => {
        this.status = s;
        this.cdr.markForCheck();
        this.ngZone.runOutsideAngular(() => requestAnimationFrame(() => this._drawChart()));
      }),
      this.trainingService.connected$.subscribe(c => {
        this.connected = c;
        this.cdr.markForCheck();
      }),
    );
  }

  ngAfterViewInit() { this._drawChart(); }

  ngOnDestroy() { this._subs.forEach(s => s.unsubscribe()); }

  // ── computed helpers ─────────────────────────────────────────────────────────

  get progressPct(): number {
    if (!this.status?.epochs) return 0;
    return Math.min(100, this.status.epoch / this.status.epochs * 100);
  }

  fmt(arr: number[] | undefined): string {
    return arr?.length ? arr[arr.length - 1].toFixed(4) : '—';
  }

  get latestLR(): string {
    const lr = this.status?.lr;
    return lr?.length ? lr[lr.length - 1].toExponential(2) : '—';
  }

  get elapsedStr(): string {
    return _fmtTime(this.status?.elapsed_s ?? 0);
  }

  get etaStr(): string {
    const s = this.status;
    if (!s?.epoch || s.epoch >= s.epochs) return '';
    return _fmtTime((s.elapsed_s / s.epoch) * (s.epochs - s.epoch));
  }

  get noImproveWarn(): boolean {
    const s = this.status;
    return !!s && s.no_improve >= s.patience * 0.7;
  }

  start() { this.trainingService.start(); }
  stop()  { this.trainingService.stop(); }

  // ── canvas chart ─────────────────────────────────────────────────────────────

  private _drawChart() {
    const canvas = this.lossCanvas?.nativeElement;
    if (!canvas || !this.status) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.offsetWidth || canvas.width;
    canvas.width  = W;
    canvas.height = 100;
    const H = 100;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, W, H);

    const tl = this.status.train_loss;
    const vl = this.status.val_loss;

    if (tl.length < 2) {
      ctx.fillStyle = '#aaa';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No data yet — start training', W / 2, H / 2 + 4);
      return;
    }

    const PAD = { l: 38, r: 8, t: 8, b: 18 };
    const gW = W - PAD.l - PAD.r;
    const gH = H - PAD.t - PAD.b;
    const maxE   = this.status.epochs || Math.max(tl.length, vl.length);
    const allVals = [...tl, ...vl].filter(v => v > 0);
    const minY = Math.min(...allVals) * 0.97;
    const maxY = Math.max(...allVals) * 1.03;

    const toX = (i: number) => PAD.l + (i / Math.max(maxE - 1, 1)) * gW;
    const toY = (v: number) => PAD.t + (1 - (v - minY) / (maxY - minY)) * gH;

    // Horizontal grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = PAD.t + i * gH / 3;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + gW, y); ctx.stroke();
      ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'right';
      ctx.fillText((maxY - i * (maxY - minY) / 3).toFixed(3), PAD.l - 3, y + 3);
    }

    // Best val dashed line
    if (this.status.best_val != null) {
      const by = toY(this.status.best_val);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(234,179,8,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.l, by); ctx.lineTo(PAD.l + gW, by); ctx.stroke();
      ctx.restore();
    }

    const _line = (data: number[], color: string) => {
      if (data.length < 2) return;
      ctx.beginPath();
      data.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      const lx = toX(data.length - 1), ly = toY(data[data.length - 1]);
      ctx.beginPath(); ctx.arc(lx, ly, 3, 0, 2 * Math.PI);
      ctx.fillStyle = color; ctx.fill();
    };

    _line(tl, '#0ea5e9');
    _line(vl, '#f97316');

    // X labels
    ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(maxE / 5));
    for (let i = 0; i <= maxE; i += step) ctx.fillText(String(i), toX(i), PAD.t + gH + 13);
  }
}

function _fmtTime(s: number): string {
  if (s < 60)   return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
