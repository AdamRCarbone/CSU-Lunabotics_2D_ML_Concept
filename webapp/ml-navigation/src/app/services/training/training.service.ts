import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface TrainingStatus {
  running:    boolean;
  epoch:      number;
  epochs:     number;
  train_loss: number[];
  val_loss:   number[];
  train_mag:  number[];
  val_mag:    number[];
  best_val:   number | null;
  lr:         number[];
  stage:      number;
  stage_name: string;
  device:     string;
  elapsed_s:  number;
  no_improve: number;
  patience:   number;
  status:     string;
}

const _DEFAULT: TrainingStatus = {
  running: false, epoch: 0, epochs: 0,
  train_loss: [], val_loss: [], train_mag: [], val_mag: [],
  best_val: null, lr: [], stage: 0, stage_name: '',
  device: '', elapsed_s: 0, no_improve: 0, patience: 20, status: 'idle',
};

@Injectable({ providedIn: 'root' })
export class TrainingService {
  private readonly BASE = 'http://localhost:5000';

  readonly status$    = new BehaviorSubject<TrainingStatus>(_DEFAULT);
  readonly connected$ = new BehaviorSubject<boolean>(false);

  private _interval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this._poll();
    this._interval = setInterval(() => this._poll(), 2000);
  }

  private async _poll() {
    try {
      const r = await fetch(`${this.BASE}/api/training/status`);
      if (!r.ok) { this.connected$.next(false); return; }
      const s: TrainingStatus = await r.json();
      this.status$.next(s);
      this.connected$.next(true);
    } catch {
      this.connected$.next(false);
    }
  }

  async start(): Promise<void> {
    await fetch(`${this.BASE}/api/training/start`, { method: 'POST' }).catch(() => {});
    setTimeout(() => this._poll(), 600);
  }

  async stop(): Promise<void> {
    await fetch(`${this.BASE}/api/training/stop`, { method: 'POST' }).catch(() => {});
    setTimeout(() => this._poll(), 600);
  }
}
