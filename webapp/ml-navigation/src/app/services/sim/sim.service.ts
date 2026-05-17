/**
 * SimService — polls the Python simulation server at ~10 Hz and exposes
 * the latest state and scene as observables.
 *
 * Server base URL defaults to http://localhost:5000 (configurable).
 */

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface SimState {
  scene_id:    number;
  rx: number;  ry: number;  heading: number;
  left: number;  right: number;  bucket: number;
  phase: string;  phase_step: number;
  expert: [number, number, number] | null;
  model:  [number, number, number] | null;
  using_model: boolean;
  path_world: [number, number][];
  step: number;  v: number;  omega: number;
  goal_x: number;  goal_y: number;
  collided: boolean;  timescale: number;
  crop_h: number[][];  crop_r: number[][];
  crop_c: number[][];  crop_w: number[][];
  goal_map: number[][];
  model_epoch: string;
}

export interface SimScene {
  scene_id: number;
  arena_w: number;  arena_l: number;  arena_type: string;
  t_rows: number;   t_cols: number;   cell_size: number;
  terrain_h: number[][];  terrain_r: number[][];
  terrain_c: number[][];  terrain_w: number[][];
  obstacles: { x: number; y: number; d: number; k: string }[];
  zones: {
    start:      { x: number; y: number; w: number; h: number };
    excavation: { x: number; y: number; w: number; h: number };
    deposit:    { x: number; y: number; w: number; h: number };
    berm:       { x: number; y: number; w: number; h: number };
  };
}

@Injectable({ providedIn: 'root' })
export class SimService implements OnDestroy {
  readonly BASE_URL = 'http://localhost:5000';

  readonly state$ = new BehaviorSubject<SimState | null>(null);
  readonly scene$ = new BehaviorSubject<SimScene | null>(null);
  readonly connected$ = new BehaviorSubject<boolean>(false);

  private _pollInterval: ReturnType<typeof setInterval> | null = null;
  private _lastSceneId  = -1;

  constructor() {
    this._startPolling();
  }

  private _startPolling() {
    this._pollInterval = setInterval(() => this._poll(), 100);
  }

  private async _poll() {
    try {
      const r = await fetch(`${this.BASE_URL}/api/state`);
      if (!r.ok) { this.connected$.next(false); return; }
      const state: SimState = await r.json();
      this.state$.next(state);
      this.connected$.next(true);

      if (state.scene_id !== this._lastSceneId) {
        this._lastSceneId = state.scene_id;
        const sr = await fetch(`${this.BASE_URL}/api/scene`);
        if (sr.ok) this.scene$.next(await sr.json());
      }
    } catch {
      this.connected$.next(false);
    }
  }

  reset() {
    fetch(`${this.BASE_URL}/api/reset`).catch(() => {});
  }

  setTimescale(v: number) {
    fetch(`${this.BASE_URL}/api/timescale?v=${v}`).catch(() => {});
  }

  ngOnDestroy() {
    if (this._pollInterval) clearInterval(this._pollInterval);
  }
}
