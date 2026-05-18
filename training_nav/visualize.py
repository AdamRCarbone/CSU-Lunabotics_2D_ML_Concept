"""CSU Lunabotics — Navigation Policy Visualizer.

Runs the simulation with the latest trained checkpoint and streams it to a
browser page that matches the Angular app's Material-3 light theme.

Usage:
  python training_nav/visualize.py                            (from repo root)
  python training_nav/visualize.py --checkpoint checkpoints/best.pt
  python training_nav/visualize.py --arena ksc
  python training_nav/visualize.py --arena ucf
  python training_nav/visualize.py --port 8766
  python training_nav/visualize.py --seed 42
"""

import argparse
import glob
import json
import math
import os
import random
import sys
import threading
import time
import traceback
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np
import yaml

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from training_nav.arena import (
    build_goal_heatmap, build_terrain_maps, crop_robot_view, generate_arena,
)
from training_nav.arena import current_zone as _current_zone
from training_nav.dataset import _goal_zone_for_phase, _PHASE_IDX, _ZONE_IDX
from training_nav.planner import _build_cost_map, astar, plan_action


# ── Shared simulation state ────────────────────────────────────────────────────

_sim_state: dict = {}
_sim_scene: dict = {}
_sim_lock  = threading.Lock()
_timescale = [1.0]
_reset_req = [False]

_PHASE_SEQ = ['to_excavation', 'digging', 'to_deposit', 'dumping']


# ── Collision helpers ──────────────────────────────────────────────────────────

def _robot_corners(rx, ry, heading, robot_w, robot_l):
    hw, hl = robot_w / 2, robot_l / 2
    cos_h, sin_h = math.cos(heading), math.sin(heading)
    return [(rx + sx * cos_h - sy * sin_h, ry + sx * sin_h + sy * cos_h)
            for sx, sy in [(hl, hw), (hl, -hw), (-hl, -hw), (-hl, hw)]]


def _check_collision(rx, ry, heading, robot_w, robot_l, obstacles):
    for obs in obstacles:
        r = obs.diameter / 2
        if abs(rx - obs.x) > robot_l + r and abs(ry - obs.y) > robot_l + r:
            continue
        cos_h, sin_h = math.cos(heading), math.sin(heading)
        dx, dy = obs.x - rx, obs.y - ry
        lx = dx * cos_h + dy * sin_h
        ly = -dx * sin_h + dy * cos_h
        cx = max(-robot_l / 2, min(robot_l / 2, lx))
        cy = max(-robot_w / 2, min(robot_w / 2, ly))
        if math.hypot(lx - cx, ly - cy) < r:
            return True
    return False


def _check_boundary(rx, ry, heading, robot_w, robot_l, arena_w, arena_l):
    return any(cx < 0 or cx > arena_w or cy < 0 or cy > arena_l
               for cx, cy in _robot_corners(rx, ry, heading, robot_w, robot_l))


def _world_to_cell(x, y, cs):
    return int(y / cs), int(x / cs)


# ── Model loading / inference ──────────────────────────────────────────────────

def _find_latest_ckpt(ckpt_dir):
    paths = sorted(glob.glob(os.path.join(ckpt_dir, 'epoch_*.pt')))
    if paths:
        return paths[-1]
    best = os.path.join(ckpt_dir, 'best.pt')
    return best if os.path.exists(best) else None


def _load_model(cfg, checkpoint_path):
    try:
        import torch
        from training_nav.model import NavPolicy
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model  = NavPolicy(cfg).to(device)
        ckpt   = torch.load(checkpoint_path, map_location=device, weights_only=False)
        model.load_state_dict(ckpt['model'])
        model.eval()
        model._device = device
        model._cfg    = cfg
        label = os.path.basename(checkpoint_path)
        print(f'[visualize] model loaded  {label}')
        return model
    except Exception as e:
        print(f'[visualize] no model ({e})')
        return None


def _infer(model, terrain_crop, goal_map, heading, phase, arena_type_val, rx, ry, arena):
    try:
        import torch
        t5  = np.concatenate([terrain_crop, goal_map[None]], axis=0)
        t   = torch.from_numpy(t5).unsqueeze(0).to(model._device)
        h   = torch.tensor([[math.sin(heading), math.cos(heading)]],
                           dtype=torch.float32).to(model._device)
        z   = torch.tensor([_ZONE_IDX.get(_current_zone(arena, rx, ry), 5)],
                           dtype=torch.long).to(model._device)
        at  = torch.tensor([arena_type_val], dtype=torch.float32).to(model._device)
        ph  = torch.tensor([_PHASE_IDX.get(phase, 0)],
                           dtype=torch.long).to(model._device)
        with torch.inference_mode():
            out, _ = model(t, h, z, at, ph)
        out = out.squeeze(0).cpu().numpy()
        nav_limit = model._cfg['robot'].get('nav_speed_limit', 0.40)
        return float(out[0]) * nav_limit, float(out[1]) * nav_limit, int(np.argmax(out[2:]))
    except Exception:
        return None


# ── Simulation loop ────────────────────────────────────────────────────────────

def _sim_loop_guarded(cfg, ckpt_dir, init_seed, arena_override):
    seed = init_seed
    while True:
        try:
            _sim_loop(cfg, ckpt_dir, seed, arena_override)
        except Exception:
            traceback.print_exc()
            time.sleep(1.0)
        seed += 1


def _sim_loop(cfg, ckpt_dir, init_seed, arena_override):
    rc        = cfg['robot']
    v_max     = rc['v_max']
    wb        = rc['wheel_base']
    robot_w   = rc['robot_width']
    robot_l   = rc['robot_length']
    cs        = cfg['terrain']['cell_size']
    BASE_DT   = 0.12
    REPLAN_N  = 15
    dig_steps = rc.get('digging_steps', 38)
    dump_steps= rc.get('dumping_steps', 27)
    mix_ucf   = cfg['training'].get('arena_mix_ucf', 0.5)

    current_ckpt = None
    model        = None
    scene_id     = 0
    seed         = init_seed

    while True:
        _reset_req[0] = False

        # Hot-reload newest checkpoint
        latest = _find_latest_ckpt(ckpt_dir)
        if latest and latest != current_ckpt:
            m = _load_model(cfg, latest)
            if m:
                model        = m
                current_ckpt = latest

        scene_id += 1
        rng    = random.Random(seed)
        np_rng = np.random.default_rng(seed)
        seed  += 1

        atype     = arena_override or ('ucf' if rng.random() < mix_ucf else 'ksc')
        atype_val = 0.0 if atype == 'ucf' else 1.0

        arena   = generate_arena(cfg, rng, arena_type=atype)
        terrain = build_terrain_maps(arena, cfg, np_rng)
        terrain_arr = np.stack([terrain['height'], terrain['rocks'],
                                terrain['craters'], terrain['walls']])
        cost_full = _build_cost_map(terrain_arr, cfg)

        def _rect(r):
            return {'x': r.x, 'y': r.y, 'w': r.w, 'h': r.h}

        with _sim_lock:
            _sim_scene.clear()
            _sim_scene.update({
                'scene_id':   scene_id,
                'arena_w':    arena.width,
                'arena_l':    arena.length,
                'arena_scale': arena.scale,
                'arena_type': atype,
                't_rows':     terrain['rows'],
                't_cols':     terrain['cols'],
                'cell_size':  cs,
                'terrain_h':  terrain['height'].tolist(),
                'terrain_r':  terrain['rocks'].tolist(),
                'terrain_c':  terrain['craters'].tolist(),
                'terrain_w':  terrain['walls'].tolist(),
                'obstacles':  [{'x': o.x, 'y': o.y, 'd': o.diameter, 'k': o.kind}
                               for o in arena.obstacles],
                'zones': {
                    'start':      _rect(arena.start_zone),
                    'excavation': _rect(arena.excavation_zone),
                    'nav':        _rect(arena.nav_zone),
                    'deposit':    _rect(arena.deposit_zone),
                    'berm':       _rect(arena.berm_target),
                },
                'checkpoint': os.path.basename(current_ckpt) if current_ckpt else 'A* Expert',
            })

        phase_idx = 0
        phase     = _PHASE_SEQ[phase_idx]
        goal_zone = _goal_zone_for_phase(arena, phase)

        margin = 0.4; clear = 0.55
        sz = arena.start_zone
        rx, ry = sz.centre()
        heading = rng.uniform(-math.pi, math.pi)
        for _ in range(80):
            _x = rng.uniform(sz.x + margin, sz.x + sz.w - margin)
            _y = rng.uniform(sz.y + margin, sz.y + sz.h - margin)
            if (sz.w > 2 * margin and sz.h > 2 * margin and
                    all(math.hypot(_x - o.x, _y - o.y) > o.diameter / 2 + clear
                        for o in arena.obstacles)):
                rx, ry = _x, _y
                heading = rng.uniform(-math.pi, math.pi)
                break

        gx, gy    = goal_zone.centre()
        goal_rc   = _world_to_cell(gx, gy, cs)
        path_full = astar(cost_full, _world_to_cell(rx, ry, cs), goal_rc) or []

        step = phase_step = 0
        prev_rx, prev_ry = rx, ry
        stuck_steps = 0
        collided = False

        while True:
            if _reset_req[0]:
                break

            t0 = time.monotonic()
            ts = max(_timescale[0], 0.05)

            crop     = crop_robot_view(terrain, rx, ry, cfg)
            goal_map = build_goal_heatmap(arena, goal_zone, rx, ry, cfg)
            expert   = plan_action(crop, goal_map, heading, cfg, phase=phase)
            model_act= (_infer(model, crop, goal_map, heading, phase, atype_val, rx, ry, arena)
                        if model else None)

            raw = model_act if model_act is not None else expert
            if raw is None:
                raw = (0.0, 0.0, 0)
            left, right, bucket = raw

            v     = ((left + right) / 2.0) * v_max
            omega = ((right - left) / wb) * v_max
            new_rx  = rx + v * math.cos(heading) * BASE_DT
            new_ry  = ry + v * math.sin(heading) * BASE_DT
            new_hdg = (heading + omega * BASE_DT + math.pi) % (2 * math.pi) - math.pi

            if (_check_collision(new_rx, new_ry, new_hdg, robot_w, robot_l, arena.obstacles) or
                    _check_boundary(new_rx, new_ry, new_hdg, robot_w, robot_l, arena.width, arena.length)):
                collided = True
            else:
                rx, ry, heading = new_rx, new_ry, new_hdg

            if step % REPLAN_N == 0 and phase not in ('digging', 'dumping'):
                path_full = astar(cost_full, _world_to_cell(rx, ry, cs), goal_rc) or []

            with _sim_lock:
                _sim_state.update({
                    'scene_id':   scene_id,
                    'rx': rx, 'ry': ry, 'heading': heading,
                    'left': left, 'right': right, 'bucket': bucket,
                    'phase': phase, 'phase_step': phase_step,
                    'expert':      list(expert)    if expert    else None,
                    'model':       list(model_act) if model_act else None,
                    'using_model': model_act is not None,
                    'path_world':  [[r * cs, c * cs] for r, c in path_full],
                    'step': step, 'v': v, 'omega': omega,
                    'collided': collided,
                    'timescale': ts,
                    'crop_h': crop[0].tolist(), 'crop_r': crop[1].tolist(),
                    'crop_c': crop[2].tolist(), 'crop_w': crop[3].tolist(),
                    'goal_map': goal_map.tolist(),
                })

            if collided:
                time.sleep(0.8)
                break

            step += 1; phase_step += 1

            if phase == 'to_excavation' and arena.excavation_zone.contains(rx, ry):   advance = True
            elif phase == 'digging'     and phase_step >= dig_steps:                   advance = True
            elif phase == 'to_deposit'  and arena.deposit_zone.contains(rx, ry):       advance = True
            elif phase == 'dumping'     and phase_step >= dump_steps:                   advance = True
            else:                                                                        advance = False

            if advance:
                phase_step = 0
                phase_idx  = (phase_idx + 1) % len(_PHASE_SEQ)
                phase      = _PHASE_SEQ[phase_idx]
                goal_zone  = _goal_zone_for_phase(arena, phase)
                gx, gy     = goal_zone.centre()
                goal_rc    = _world_to_cell(gx, gy, cs)
                path_full  = (astar(cost_full, _world_to_cell(rx, ry, cs), goal_rc) or []
                              if phase not in ('digging', 'dumping') else [])
                time.sleep(max(0.0, 0.4 / ts))

            if step % 20 == 0:
                dist = math.hypot(rx - prev_rx, ry - prev_ry)
                if dist < 0.05:
                    stuck_steps += 1
                    if stuck_steps >= 5:
                        break
                else:
                    stuck_steps = 0
                prev_rx, prev_ry = rx, ry

            time.sleep(max(0.0, BASE_DT / ts - (time.monotonic() - t0)))


# ── HTML page ──────────────────────────────────────────────────────────────────

_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CSU Lunabotics — Nav Visualizer</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #f0f0f2;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}

/* ── App bar ── */
.appbar {
  background: #fff;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  padding: 0.6rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.07);
  flex-shrink: 0;
}
.appbar-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #1a1a2e;
  letter-spacing: 0.02em;
}
.appbar-sub {
  font-size: 0.75rem;
  color: #888;
}

/* ── Chips ── */
.chip {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 99px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.chip-model  { background: #e0f2fe; color: #0369a1; }
.chip-expert { background: #fef9c3; color: #a16207; }
.chip-ksc    { background: #dcfce7; color: #16a34a; }
.chip-ucf    { background: #fce7f3; color: #9d174d; }
.chip-run    { background: #dcfce7; color: #16a34a; }
.chip-col    { background: #fee2e2; color: #dc2626; }

.dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #22c55e; box-shadow: 0 0 5px #22c55e88;
  flex-shrink: 0; transition: background 0.2s;
}
.dot.collision { background: #ef4444; box-shadow: 0 0 5px #ef444488; }

.appbar-right {
  margin-left: auto;
  display: flex; align-items: center; gap: 1rem;
}
.hval { font-size: 0.75rem; color: #999; }
.hval strong { color: #333; font-family: 'Menlo','Consolas',monospace; }

/* ── Main layout ── */
main {
  flex: 1;
  padding: 1.25rem 1.5rem;
  display: grid;
  grid-template-columns: 260px 1fr 260px;
  gap: 1.25rem;
  align-items: start;
  max-width: 1700px;
  margin: 0 auto;
  width: 100%;
}

/* ── Card ── */
.card {
  background: #fff;
  border-radius: 0.875rem;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  border: 1px solid rgba(0,0,0,0.06);
}
.card-header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(0,0,0,0.07);
  font-size: 0.78rem;
  font-weight: 700;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.card-content { padding: 0.875rem 1rem; }

.left-col, .right-col {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Zone legend ── */
.zone-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 4px 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.78rem; color: #444;
}
.zone-row:last-child { border-bottom: none; }
.zone-swatch {
  width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0;
}

/* ── Param rows ── */
.param-group { margin-bottom: 0.75rem; }
.param-group:last-child { margin-bottom: 0; }
.param-header {
  font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: #aaa; margin-bottom: 0.3rem;
  display: flex; align-items: center; gap: 0.4rem;
}
.param-header-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.param-row {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 3px 0; font-size: 0.78rem;
  border-bottom: 1px solid #f3f4f6;
}
.param-row:last-child { border-bottom: none; }
.param-key { color: #888; }
.param-val { font-family: 'Menlo','Consolas',monospace; color: #222; font-size: 0.8rem; }

/* ── Bucket pips ── */
.bucket-row { display: flex; gap: 6px; margin-bottom: 0.6rem; }
.bucket-pip {
  flex: 1; text-align: center; padding: 5px 0; border-radius: 6px;
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  border: 1px solid #e5e7eb; color: #ccc; background: #fafafa;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.pip-up      { background: #dcfce7; color: #16a34a; border-color: #bbf7d0; }
.pip-collect { background: #fef3c7; color: #d97706; border-color: #fde68a; }
.pip-dump    { background: #fee2e2; color: #dc2626; border-color: #fecaca; }

/* ── Phase progress bar ── */
.phase-label { font-size: 0.72rem; color: #888; margin-bottom: 4px; }
.phase-track { height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
.phase-fill  { height: 100%; border-radius: 3px; transition: width 0.12s, background 0.15s; }

/* ── Motor bars ── */
.motor-bar-wrap { margin-bottom: 0.6rem; }
.motor-bar-label { display: flex; justify-content: space-between; font-size: 0.72rem; color: #888; margin-bottom: 3px; }
.motor-bar-label strong { font-family: 'Menlo','Consolas',monospace; color: #333; }
.motor-track { height: 8px; background: #e5e7eb; border-radius: 4px; position: relative; overflow: hidden; }
.motor-fill-fwd { position: absolute; top: 0; left: 50%; height: 100%; background: #22c55e; border-radius: 4px; transition: width 0.08s; }
.motor-fill-rev { position: absolute; top: 0; right: 50%; height: 100%; background: #ef4444; border-radius: 4px; transition: width 0.08s; }

.divider { height: 1px; background: #f0f0f0; margin: 0.6rem 0; }

.cmp-row { display: flex; justify-content: space-between; font-size: 0.75rem; padding: 3px 0; }
.cmp-key { color: #aaa; }
.cmp-expert { font-family: 'Menlo','Consolas',monospace; color: #d97706; }
.cmp-model  { font-family: 'Menlo','Consolas',monospace; color: #0ea5e9; }

/* ── Info grid ── */
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 0.75rem; }
.info-item { display: flex; flex-direction: column; gap: 1px; }
.info-key  { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: #aaa; }
.info-val  { font-size: 0.78rem; font-family: 'Menlo','Consolas',monospace; color: #333; }

/* ── Timescale ── */
.ts-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding-top: 0.6rem; margin-top: 0.4rem;
  border-top: 1px solid rgba(0,0,0,0.06);
}
.ts-label { font-size: 0.72rem; color: #888; }
.ts-val   { font-family: 'Menlo','Consolas',monospace; font-size: 0.78rem; color: #333; min-width: 2.5rem; text-align: right; }
input[type=range] { flex: 1; accent-color: #0ea5e9; }

/* ── Center: arena canvas card ── */
.arena-card {
  background: #fff;
  border-radius: 0.875rem;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  border: 1px solid rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
}
.arena-canvas-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
}
#arenaCanvas { display: block; }

/* ── Sensor view ── */
.crop-wrap { display: flex; justify-content: center; padding-bottom: 0.25rem; }
#cropCanvas { border-radius: 6px; display: block; border: 1px solid rgba(0,0,0,0.06); }

</style>
</head>
<body>

<!-- ── App bar ── -->
<div class="appbar">
  <div class="appbar-title">CSU Lunabotics</div>
  <div class="appbar-sub">Navigation Visualizer</div>
  <span class="chip chip-expert" id="modeBadge">A* Expert</span>
  <span class="chip chip-ksc"   id="arenaBadge">KSC</span>
  <div class="dot" id="statusDot"></div>
  <div class="appbar-right">
    <span class="hval">v&nbsp;<strong id="hVel">—</strong>&nbsp;m/s</span>
    <span class="hval">ω&nbsp;<strong id="hOmega">—</strong>&nbsp;rad/s</span>
    <span class="hval">hdg&nbsp;<strong id="hHdg">—</strong>°</span>
    <span class="hval" id="hPos">—</span>
  </div>
</div>

<main>

  <!-- ── Left column ── -->
  <div class="left-col">

    <div class="card">
      <div class="card-header">Zone Legend</div>
      <div class="card-content">
        <div class="zone-row"><div class="zone-swatch" style="background:#69D14044;border:2px solid #69D140;"></div>Start</div>
        <div class="zone-row"><div class="zone-swatch" style="background:#4099d144;border:2px solid #4099d1;"></div>Excavation</div>
        <div class="zone-row"><div class="zone-swatch" style="background:#aaaaaa22;border:2px solid #aaaaaa;"></div>Navigate</div>
        <div class="zone-row"><div class="zone-swatch" style="background:#ffa43d44;border:2px solid #ffa43d;"></div>Deposit</div>
        <div class="zone-row"><div class="zone-swatch" style="background:#ff360944;border:2px solid #ff3609;"></div>Berm Target</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Rover Status</div>
      <div class="card-content">

        <div class="param-group">
          <div class="param-header">
            <div class="param-header-dot" style="background:#6eb9ff;"></div>
            Position
          </div>
          <div class="param-row">
            <span class="param-key">x</span>
            <span class="param-val" id="posX">—</span>
          </div>
          <div class="param-row">
            <span class="param-key">y</span>
            <span class="param-val" id="posY">—</span>
          </div>
          <div class="param-row">
            <span class="param-key">heading</span>
            <span class="param-val" id="posHdg">—</span>
          </div>
        </div>

        <div class="param-group">
          <div class="param-header">
            <div class="param-header-dot" style="background:#ff9800;"></div>
            Bucket
          </div>
          <div class="bucket-row">
            <div class="bucket-pip" id="bPip0">UP</div>
            <div class="bucket-pip" id="bPip1">COLLECT</div>
            <div class="bucket-pip" id="bPip2">DUMP</div>
          </div>
        </div>

        <div class="param-group">
          <div class="param-header">Phase</div>
          <div class="phase-label" id="phaseLabel">—</div>
          <div class="phase-track">
            <div class="phase-fill" id="phaseFill" style="width:0%;background:#22c55e;"></div>
          </div>
        </div>

      </div>
    </div>

  </div>

  <!-- ── Center: arena ── -->
  <div class="arena-card">
    <div class="card-header" id="arenaHeader">
      Arena
    </div>
    <div class="arena-canvas-wrap">
      <canvas id="arenaCanvas"></canvas>
    </div>
  </div>

  <!-- ── Right column ── -->
  <div class="right-col">

    <div class="card">
      <div class="card-header">Drive Motors</div>
      <div class="card-content">

        <div class="motor-bar-wrap">
          <div class="motor-bar-label">
            <span>Left</span>
            <strong id="motorLVal">—</strong>
          </div>
          <div class="motor-track">
            <div class="motor-fill-fwd" id="motorLFwd" style="width:0%;"></div>
            <div class="motor-fill-rev" id="motorLRev" style="width:0%;"></div>
          </div>
        </div>

        <div class="motor-bar-wrap">
          <div class="motor-bar-label">
            <span>Right</span>
            <strong id="motorRVal">—</strong>
          </div>
          <div class="motor-track">
            <div class="motor-fill-fwd" id="motorRFwd" style="width:0%;"></div>
            <div class="motor-fill-rev" id="motorRRev" style="width:0%;"></div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="cmp-row">
          <span class="cmp-key">Expert (A*)</span>
          <span class="cmp-expert" id="cmpExpert">—</span>
        </div>
        <div class="cmp-row">
          <span class="cmp-key">Model</span>
          <span class="cmp-model" id="cmpModel">—</span>
        </div>

        <div class="ts-row">
          <span class="ts-label">Speed</span>
          <input type="range" id="tsSlider" min="0.1" max="5" step="0.1" value="1"
                 oninput="onTimescale(this.value)">
          <span class="ts-val" id="tsVal">1.0×</span>
        </div>

      </div>
    </div>

    <div class="card">
      <div class="card-header">Sensor View</div>
      <div class="card-content">
        <div class="crop-wrap">
          <canvas id="cropCanvas" width="220" height="220"></canvas>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Arena Info</div>
      <div class="card-content">
        <div class="info-grid">
          <div class="info-item"><span class="info-key">Layout</span><span class="info-val" id="iLayout">—</span></div>
          <div class="info-item"><span class="info-key">Scene</span><span class="info-val" id="iScene">—</span></div>
          <div class="info-item"><span class="info-key">Width</span><span class="info-val" id="iW">—</span></div>
          <div class="info-item"><span class="info-key">Length</span><span class="info-val" id="iL">—</span></div>
          <div class="info-item"><span class="info-key">Obstacles</span><span class="info-val" id="iObs">—</span></div>
          <div class="info-item"><span class="info-key">Step</span><span class="info-val" id="iStep">—</span></div>
          <div class="info-item info-item-full" style="grid-column:span 2;">
            <span class="info-key">Checkpoint</span>
            <span class="info-val" id="iCkpt" style="font-size:0.7rem;word-break:break-all;">—</span>
          </div>
        </div>
      </div>
    </div>

  </div>

</main>

<script>
const V_MAX      = _V_MAX_;
const WHEEL_BASE = _WHEEL_BASE_;
const ROBOT_W    = _ROBOT_W_;
const ROBOT_L    = _ROBOT_L_;
const PROJ_TIME  = _PROJ_TIME_;
const GS         = _GS_;
const VIEW_W     = _VIEW_W_;
const VIEW_H     = _VIEW_H_;
const DIG_STEPS  = _DIG_STEPS_;
const DUMP_STEPS = _DUMP_STEPS_;

const PHASE_MAX = { to_excavation: null, digging: DIG_STEPS, to_deposit: null, dumping: DUMP_STEPS };
const PHASE_COLOR = { to_excavation: '#22c55e', digging: '#f97316', to_deposit: '#22c55e', dumping: '#8b5cf6' };

let scene = null, state = null, lastSceneId = -1;

// ── Polling ────────────────────────────────────────────────────────────────────
async function pollState() {
  try {
    const r = await fetch('/api/state');
    if (!r.ok) return;
    state = await r.json();
    if (state.scene_id !== lastSceneId) {
      lastSceneId = state.scene_id;
      const sr = await fetch('/api/scene');
      if (sr.ok) scene = await sr.json();
    }
  } catch(e) {}
}
setInterval(pollState, 100);

// ── Render loop ────────────────────────────────────────────────────────────────
function raf() {
  requestAnimationFrame(raf);
  if (!state || !scene || state.rx == null) return;
  drawArena();
  drawCrop();
  updateUI();
}
requestAnimationFrame(raf);

// ── Coordinate: world → canvas ────────────────────────────────────────────────
function w2c(wx, wy, W, H) {
  return { x: wx / scene.arena_w * W, y: (1 - wy / scene.arena_l) * H };
}

// ── Rounded rect ──────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// ── Robot rectangle ───────────────────────────────────────────────────────────
function drawRobot(ctx, cx, cy, lPx, wPx, heading) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-heading);
  const r = Math.min(4, lPx * 0.1);

  // Shadow glow
  ctx.shadowColor = 'rgba(14,165,233,0.35)';
  ctx.shadowBlur  = 12;
  roundRect(ctx, -lPx/2 - 3, -wPx/2 - 3, lPx + 6, wPx + 6, r + 2);
  ctx.fillStyle = 'rgba(14,165,233,0.06)';
  ctx.fill();
  ctx.shadowBlur = 0;

  // Body
  roundRect(ctx, -lPx/2, -wPx/2, lPx, wPx, r);
  ctx.fillStyle   = '#fff';
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth   = 2;
  ctx.fill();
  ctx.stroke();

  // Front indicator (blue panel at front = +L/2)
  const panelW = Math.max(3, lPx * 0.1);
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(lPx/2 - panelW, -wPx/2, panelW, wPx);

  ctx.restore();
}

// ── A* path ───────────────────────────────────────────────────────────────────
function drawPath(ctx, W, H) {
  if (!state.path_world || state.path_world.length < 2) return;
  ctx.save();
  ctx.shadowColor = 'rgba(251,191,36,0.5)';
  ctx.shadowBlur  = 4;
  ctx.beginPath();
  state.path_world.forEach(([wy, wx], i) => {
    const p = w2c(wx, wy, W, H);
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = 'rgba(245,158,11,0.85)';
  ctx.lineWidth   = 1.5;
  ctx.lineJoin    = 'round';
  ctx.stroke();
  ctx.shadowBlur  = 0;
  ctx.restore();
}

// ── Motion arc ────────────────────────────────────────────────────────────────
function projectArc() {
  const left = state.left, right = state.right;
  const DT = 0.06, steps = Math.round(PROJ_TIME / DT);
  const x0 = state.rx + (ROBOT_L / 2) * Math.cos(state.heading);
  const y0 = state.ry + (ROBOT_L / 2) * Math.sin(state.heading);
  const pts = [{x: x0, y: y0}];
  let x = x0, y = y0, h = state.heading;
  for (let i = 0; i < steps; i++) {
    const vL = left * V_MAX, vR = right * V_MAX;
    const v  = (vL + vR) / 2, w = (vR - vL) / WHEEL_BASE;
    x += v * Math.cos(h) * DT;
    y += v * Math.sin(h) * DT;
    h += w * DT;
    pts.push({x, y});
  }
  return pts;
}

function drawArc(ctx, pts, W, H) {
  if (pts.length < 2) return;
  const cpts = pts.map(p => w2c(p.x, p.y, W, H));
  const n    = cpts.length;
  const grad = ctx.createLinearGradient(cpts[0].x, cpts[0].y, cpts[n-1].x, cpts[n-1].y);
  grad.addColorStop(0,    'rgba(34,197,94,0.65)');
  grad.addColorStop(0.2,  'rgba(34,197,94,0.35)');
  grad.addColorStop(0.6,  'rgba(34,197,94,0.10)');
  grad.addColorStop(1,    'rgba(34,197,94,0.00)');
  ctx.beginPath();
  cpts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.stroke();
}

// ── Arena canvas ──────────────────────────────────────────────────────────────
function drawArena() {
  const wrap   = document.querySelector('.arena-canvas-wrap');
  const canvas = document.getElementById('arenaCanvas');
  const maxW   = wrap.clientWidth  - 24;
  const maxH   = Math.max(300, window.innerHeight - 200);
  const ratio  = scene.arena_w / scene.arena_l;
  let W, H;
  if (maxW / maxH > ratio) { H = Math.min(maxH, maxW / ratio); W = H * ratio; }
  else                     { W = maxW; H = W / ratio; }
  W = Math.floor(W); H = Math.floor(H);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Arena fill (light gray, like Angular env)
  ctx.fillStyle = '#dcdcde';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.lineWidth   = 0.5;
  const GRID_M    = 0.5;
  for (let gx = 0; gx <= scene.arena_w; gx += GRID_M) {
    const px = gx / scene.arena_w * W;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
  }
  for (let gy = 0; gy <= scene.arena_l; gy += GRID_M) {
    const py = (1 - gy / scene.arena_l) * H;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
  }

  // Zone overlays — Angular app colors
  const ZONE_DEF = [
    { key: 'excavation', fill: 'rgba(64,153,209,0.18)', stroke: 'rgba(64,153,209,0.7)',  label: 'EXCAVATION' },
    { key: 'nav',        fill: 'rgba(180,180,180,0.08)', stroke: 'rgba(150,150,150,0.3)', label: 'NAVIGATE'   },
    { key: 'deposit',    fill: 'rgba(255,164,61,0.18)',  stroke: 'rgba(255,164,61,0.7)',  label: 'DEPOSIT'    },
    { key: 'start',      fill: 'rgba(105,209,64,0.22)',  stroke: 'rgba(105,209,64,0.7)',  label: 'START'      },
    { key: 'berm',       fill: 'rgba(255,54,9,0.18)',    stroke: 'rgba(255,54,9,0.7)',    label: 'BERM'       },
  ];
  const fontSize = Math.max(8, Math.floor(W / 55));
  ctx.font = `${fontSize}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  for (const z of ZONE_DEF) {
    const zd = scene.zones[z.key]; if (!zd) continue;
    const tl = w2c(zd.x, zd.y + zd.h, W, H);
    const br = w2c(zd.x + zd.w, zd.y, W, H);
    const zw = br.x - tl.x, zh = br.y - tl.y;
    ctx.fillStyle   = z.fill;   ctx.fillRect(tl.x, tl.y, zw, zh);
    ctx.strokeStyle = z.stroke; ctx.lineWidth = z.key === 'berm' ? 1.5 : 1;
    if (z.key === 'berm') ctx.setLineDash([4, 3]);
    ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, zw - 1, zh - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillText(z.label, (tl.x + br.x) / 2, (tl.y + br.y) / 2);
  }

  // Obstacles
  for (const o of scene.obstacles) {
    const p  = w2c(o.x, o.y, W, H);
    const rr = Math.max(3, (o.d / 2) / scene.arena_w * W);
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 2 * Math.PI);
    if (o.k === 'rock')   { ctx.fillStyle = 'rgba(120,115,110,0.75)'; ctx.strokeStyle = 'rgba(90,85,80,0.9)'; }
    else if (o.k==='column'){ctx.fillStyle='rgba(80,80,100,0.8)'; ctx.strokeStyle='rgba(60,60,80,0.9)';}
    else                  { ctx.fillStyle = 'rgba(80,60,50,0.75)';  ctx.strokeStyle = 'rgba(60,40,30,0.9)'; }
    ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
  }

  // A* path
  drawPath(ctx, W, H);

  // Motion arc
  drawArc(ctx, projectArc(), W, H);

  // Robot
  const rp   = w2c(state.rx, state.ry, W, H);
  const lPx  = (ROBOT_L / scene.arena_l) * H;
  const wPx  = (ROBOT_W / scene.arena_w) * W;
  drawRobot(ctx, rp.x, rp.y, lPx, wPx, state.heading);

  // Wall panels (red strips, like Angular environment)
  const wallPx = Math.max(2, W * 0.008);
  ctx.fillStyle   = 'rgba(210,40,40,0.85)';
  ctx.strokeStyle = 'rgba(160,20,20,0.9)';
  ctx.lineWidth   = 1;
  ctx.fillRect(0,         0,         W,       wallPx); // N
  ctx.fillRect(0,         H - wallPx, W,      wallPx); // S
  ctx.fillRect(0,         0,         wallPx,  H);       // W
  ctx.fillRect(W - wallPx, 0,         wallPx, H);       // E
}

// ── Sensor crop canvas ────────────────────────────────────────────────────────
function drawCrop() {
  if (!state.crop_h) return;
  const canvas = document.getElementById('cropCanvas');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cW = W / GS, cH = H / GS;
  ctx.clearRect(0, 0, W, H);

  // Height map (flip Y: row 0 = world south, top of canvas = north)
  for (let r = 0; r < GS; r++) {
    for (let c = 0; c < GS; c++) {
      const cy  = (GS - 1 - r) * cH;
      const t   = state.crop_h[r][c];
      const v   = Math.round(180 + t * 40);
      ctx.fillStyle = `rgb(${v},${v},${v+2})`;
      ctx.fillRect(c * cW, cy, cW + 0.5, cH + 0.5);
    }
  }
  // Rocks overlay
  for (let r = 0; r < GS; r++) for (let c = 0; c < GS; c++) {
    const v = state.crop_r[r][c];
    if (v > 0.05) {
      ctx.fillStyle = `rgba(100,95,90,${v * 0.7})`;
      ctx.fillRect(c * cW, (GS - 1 - r) * cH, cW + 0.5, cH + 0.5);
    }
  }
  // Craters overlay
  for (let r = 0; r < GS; r++) for (let c = 0; c < GS; c++) {
    const v = state.crop_c[r][c];
    if (v > 0.05) {
      ctx.fillStyle = `rgba(70,50,40,${v * 0.7})`;
      ctx.fillRect(c * cW, (GS - 1 - r) * cH, cW + 0.5, cH + 0.5);
    }
  }
  // Walls
  for (let r = 0; r < GS; r++) for (let c = 0; c < GS; c++) {
    if (state.crop_w[r][c] > 0.5) {
      ctx.fillStyle = 'rgba(40,40,50,0.85)';
      ctx.fillRect(c * cW, (GS - 1 - r) * cH, cW + 0.5, cH + 0.5);
    }
  }
  // Goal heatmap
  for (let r = 0; r < GS; r++) for (let c = 0; c < GS; c++) {
    const v = state.goal_map[r][c];
    if (v > 0.02) {
      ctx.fillStyle = `rgba(34,197,94,${v * 0.5})`;
      ctx.fillRect(c * cW, (GS - 1 - r) * cH, cW + 0.5, cH + 0.5);
    }
  }
  // Robot marker (center of crop)
  const cx = (GS / 2 + 0.5) * cW, cy2 = (GS / 2 + 0.5) * cH;
  const lPx = (ROBOT_L / VIEW_H) * H, wPx = (ROBOT_W / VIEW_W) * W;
  drawRobot(ctx, cx, cy2, lPx, wPx, state.heading);
}

// ── UI updates ─────────────────────────────────────────────────────────────────
function setMotor(fwdId, revId, valId, v) {
  const pct = Math.abs(v) * 50;
  document.getElementById(fwdId).style.width = (v >= 0 ? pct : 0) + '%';
  document.getElementById(revId).style.width = (v <  0 ? pct : 0) + '%';
  document.getElementById(valId).textContent = v.toFixed(2);
}

function updateUI() {
  document.getElementById('hVel').textContent   = state.v.toFixed(3);
  document.getElementById('hOmega').textContent = state.omega.toFixed(3);
  document.getElementById('hHdg').textContent   = (state.heading * 180 / Math.PI).toFixed(1);
  document.getElementById('hPos').textContent   = `(${state.rx.toFixed(2)}, ${state.ry.toFixed(2)}) m`;
  document.getElementById('posX').textContent   = state.rx.toFixed(3) + ' m';
  document.getElementById('posY').textContent   = state.ry.toFixed(3) + ' m';
  document.getElementById('posHdg').textContent = (state.heading * 180 / Math.PI).toFixed(1) + '°';

  document.getElementById('statusDot').className = 'dot' + (state.collided ? ' collision' : '');

  setMotor('motorLFwd','motorLRev','motorLVal', state.left);
  setMotor('motorRFwd','motorRRev','motorRVal', state.right);

  const fmt = a => a ? `L=${a[0].toFixed(2)} R=${a[1].toFixed(2)}` : '—';
  document.getElementById('cmpExpert').textContent = fmt(state.expert);
  document.getElementById('cmpModel').textContent  = state.model ? fmt(state.model) : 'no model';

  const modeBadge = document.getElementById('modeBadge');
  if (state.using_model) {
    modeBadge.textContent = 'Model'; modeBadge.className = 'chip chip-model';
  } else {
    modeBadge.textContent = 'A* Expert'; modeBadge.className = 'chip chip-expert';
  }

  // Bucket pips
  const b = state.bucket ?? 0;
  document.getElementById('bPip0').className = 'bucket-pip' + (b === 0 ? ' pip-up'      : '');
  document.getElementById('bPip1').className = 'bucket-pip' + (b === 1 ? ' pip-collect' : '');
  document.getElementById('bPip2').className = 'bucket-pip' + (b === 2 ? ' pip-dump'    : '');

  // Phase bar
  const phase    = state.phase || 'to_excavation';
  const maxSteps = PHASE_MAX[phase];
  const pct      = maxSteps ? Math.min(100, (state.phase_step || 0) / maxSteps * 100) : 0;
  const fill     = document.getElementById('phaseFill');
  fill.style.width      = pct + '%';
  fill.style.background = PHASE_COLOR[phase] || '#22c55e';
  document.getElementById('phaseLabel').textContent =
    phase.replace(/_/g, ' ').toUpperCase() +
    (maxSteps ? `  ${state.phase_step || 0} / ${maxSteps}` : '');

  if (scene) {
    const rocks   = scene.obstacles.filter(o => o.k === 'rock').length;
    const craters = scene.obstacles.filter(o => o.k === 'crater').length;
    const atype   = (scene.arena_type || 'ksc').toUpperCase();
    document.getElementById('iLayout').textContent = atype;
    document.getElementById('iScene').textContent  = '#' + scene.scene_id;
    document.getElementById('iW').textContent      = scene.arena_w.toFixed(2) + ' m';
    document.getElementById('iL').textContent      = scene.arena_l.toFixed(2) + ' m';
    document.getElementById('iObs').textContent    = `${rocks}r  ${craters}c`;
    document.getElementById('iStep').textContent   = state.step;
    document.getElementById('iCkpt').textContent   = scene.checkpoint || '—';

    const ab = document.getElementById('arenaBadge');
    ab.textContent = atype;
    ab.className   = 'chip chip-' + (scene.arena_type || 'ksc');

    document.getElementById('arenaHeader').innerHTML =
      'Arena &nbsp;&nbsp;' +
      `<span style="font-size:0.7rem;font-weight:400;color:#aaa;">${scene.arena_w.toFixed(2)}m × ${scene.arena_l.toFixed(2)}m &nbsp;·&nbsp; scene #${scene.scene_id}</span>`;
  }
}

function onTimescale(val) {
  const ts = parseFloat(val);
  document.getElementById('tsVal').textContent = ts.toFixed(1) + '×';
  fetch('/api/timescale?v=' + ts);
}

pollState();
</script>
</body>
</html>
"""


# ── HTTP handler ───────────────────────────────────────────────────────────────

class _Handler(BaseHTTPRequestHandler):
    _html_cache: str = ''

    def log_message(self, *_): pass

    def do_GET(self):
        parsed = urlparse(self.path)
        qs     = parse_qs(parsed.query)
        path   = parsed.path

        if path == '/':
            enc = self._html_cache.encode()
            self.send_response(200)
            self.send_header('Content-Type',   'text/html; charset=utf-8')
            self.send_header('Content-Length', len(enc))
            self.end_headers()
            self.wfile.write(enc)

        elif path == '/api/state':
            with _sim_lock:
                data = dict(_sim_state)
            self._json(data)

        elif path == '/api/scene':
            with _sim_lock:
                data = dict(_sim_scene)
            self._json(data)

        elif path == '/api/reset':
            _reset_req[0] = True
            self._json({'ok': True})

        elif path == '/api/timescale':
            try:
                _timescale[0] = max(0.05, min(10.0, float(qs.get('v', ['1'])[0])))
            except (ValueError, KeyError):
                pass
            self._json({'timescale': _timescale[0]})

        else:
            self.send_error(404)

    def _json(self, obj):
        enc = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', len(enc))
        self.send_header('Cache-Control',  'no-cache')
        self.end_headers()
        self.wfile.write(enc)


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    _dir = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser()
    parser.add_argument('--config',     default=os.path.join(_dir, 'config.yaml'))
    parser.add_argument('--checkpoint', default=None,
                        help='Specific checkpoint path (default: latest in checkpoints/)')
    parser.add_argument('--seed',       type=int, default=0)
    parser.add_argument('--port',       type=int, default=8766)
    parser.add_argument('--arena',      choices=['ksc', 'ucf', 'random'], default='random')
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    rc = cfg['robot']
    ckpt_dir = os.path.join(_dir, cfg['checkpoints']['dir'])
    if not os.path.isabs(ckpt_dir):
        ckpt_dir = os.path.join(_dir, cfg['checkpoints']['dir'])

    # If specific checkpoint given, treat its directory as ckpt_dir too
    if args.checkpoint:
        ckpt_dir = os.path.dirname(os.path.abspath(args.checkpoint))

    arena_override = None if args.arena == 'random' else args.arena

    # Build HTML with injected constants
    html = (
        _HTML
        .replace('_V_MAX_',      str(rc['v_max']))
        .replace('_WHEEL_BASE_', str(rc['wheel_base']))
        .replace('_ROBOT_W_',    str(rc['robot_width']))
        .replace('_ROBOT_L_',    str(rc['robot_length']))
        .replace('_PROJ_TIME_',  str(rc.get('projection_time', 4.0)))
        .replace('_GS_',         str(cfg['terrain']['grid_size']))
        .replace('_VIEW_W_',     str(cfg['terrain']['view_width']))
        .replace('_VIEW_H_',     str(cfg['terrain']['view_height']))
        .replace('_DIG_STEPS_',  str(rc.get('digging_steps',  38)))
        .replace('_DUMP_STEPS_', str(rc.get('dumping_steps',  27)))
    )
    _Handler._html_cache = html

    sim_thread = threading.Thread(
        target=_sim_loop_guarded,
        args=(cfg, ckpt_dir, args.seed, arena_override),
        daemon=True,
    )
    sim_thread.start()

    url = f'http://localhost:{args.port}'
    server = ThreadingHTTPServer(('localhost', args.port), _Handler)
    print(f'[visualize]  {url}')
    print(f'[visualize]  checkpoint dir: {ckpt_dir}')
    print(f'[visualize]  hot-reloads latest checkpoint automatically')
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[visualize] stopped.')


if __name__ == '__main__':
    main()
