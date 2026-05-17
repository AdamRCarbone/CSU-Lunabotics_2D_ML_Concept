"""Navigation policy live visualizer — Tesla-style arena inspector.

Runs a continuous differential-drive simulation (A* expert or trained model)
with a full 4-phase excavation curriculum and streams state to a browser at
~10 Hz.

Phase state machine (loops):
  to_excavation  → drive to excavation zone  (bucket UP)
  digging        → slow forward for N steps   (bucket COLLECT)
  to_deposit     → drive to berm target       (bucket UP)
  dumping        → stopped for N steps        (bucket DUMP)

Collision detection: robot body rectangle vs obstacle circles → arena reset.

Usage:
  python training_nav/visualize.py                       (from repo root)
  python visualize.py                                    (from training_nav/)
  python training_nav/visualize.py --checkpoint path/to/best.pt
  python training_nav/visualize.py --arena ksc           (force KSC layout)
  python training_nav/visualize.py --arena ucf           (force UCF layout)
  python training_nav/visualize.py --arena random        (mix both, default)
  python training_nav/visualize.py --seed 42
  python training_nav/visualize.py --port 8766
"""

import argparse
import http.server
import json
import math
import os
import random
import sys
import threading
import time
import traceback
import webbrowser

import numpy as np
import yaml

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from training_nav.arena import (
    build_goal_heatmap, build_terrain_maps, crop_robot_view, generate_arena,
)
from training_nav.arena import current_zone as _current_zone
from training_nav.dataset import _goal_zone_for_phase, _sample_robot_pose, _PHASE_IDX, _ZONE_IDX
from training_nav.planner import _build_cost_map, astar, plan_action


def _find_latest_ckpt(ckpt_dir: str):
    """Return the most recent epoch_XXXX.pt path in ckpt_dir, or None."""
    import glob as _glob
    paths = sorted(_glob.glob(os.path.join(ckpt_dir, 'epoch_*.pt')))
    return paths[-1] if paths else None


# ── Config ─────────────────────────────────────────────────────────────────────

def _load_cfg(path: str) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


# ── Simulation state (shared between sim thread and HTTP handler) ──────────────

_sim_state: dict = {}
_sim_scene: dict = {}
_sim_lock  = threading.Lock()

# Mutable control signals from HTTP → sim thread
_timescale = [1.0]   # [0] = current timescale multiplier


# ── Full-arena A* (for display path in world coords) ──────────────────────────

def _build_full_cost_map(terrain: dict, cfg: dict) -> np.ndarray:
    pc = cfg['planner']
    from scipy.ndimage import sobel
    h  = terrain['height']
    sx = sobel(h, axis=1); sy = sobel(h, axis=0)
    slope = np.sqrt(sx**2 + sy**2)
    cost = (1.0
            + pc['slope_weight']  * slope
            + pc['rock_weight']   * terrain['rocks']
            + pc['crater_weight'] * terrain['craters']
            + pc['wall_weight']   * terrain['walls'])
    return cost.astype(np.float32)


def _world_to_cell(x: float, y: float, cs: float):
    return int(y / cs), int(x / cs)   # (row, col)


# ── Collision detection ────────────────────────────────────────────────────────

def _robot_corners(rx: float, ry: float, heading: float,
                   robot_w: float, robot_l: float) -> list:
    """Return the 4 corners of the robot bounding rectangle in world coords."""
    hw, hl = robot_w / 2, robot_l / 2
    cos_h, sin_h = math.cos(heading), math.sin(heading)
    corners = []
    for sx, sy in [( hl,  hw), ( hl, -hw), (-hl, -hw), (-hl,  hw)]:
        corners.append((
            rx + sx * cos_h - sy * sin_h,
            ry + sx * sin_h + sy * cos_h,
        ))
    return corners


def _check_collision(rx: float, ry: float, heading: float,
                     robot_w: float, robot_l: float,
                     obstacles: list) -> bool:
    """Return True if the robot rectangle overlaps any obstacle circle."""
    # (see _check_boundary for arena-wall collision)
    corners = _robot_corners(rx, ry, heading, robot_w, robot_l)
    for obs in obstacles:
        r = obs.diameter / 2
        # Quick AABB reject
        if (abs(rx - obs.x) > robot_l + r and
                abs(ry - obs.y) > robot_l + r):
            continue
        # Precise: closest point on rectangle edge to circle centre
        # Use SAT-lite: test centre against expanded rectangle first
        dx = obs.x - rx
        dy = obs.y - ry
        cos_h, sin_h = math.cos(heading), math.sin(heading)
        # Transform obstacle centre into robot-local frame
        local_x =  dx * cos_h + dy * sin_h
        local_y = -dx * sin_h + dy * cos_h
        closest_x = max(-robot_l / 2, min(robot_l / 2, local_x))
        closest_y = max(-robot_w / 2, min(robot_w / 2, local_y))
        dist = math.hypot(local_x - closest_x, local_y - closest_y)
        if dist < r:
            return True
    return False


def _check_boundary(rx: float, ry: float, heading: float,
                    robot_w: float, robot_l: float,
                    arena_w: float, arena_l: float) -> bool:
    """Return True if any robot corner has crossed the arena boundary."""
    for cx, cy in _robot_corners(rx, ry, heading, robot_w, robot_l):
        if cx < 0 or cx > arena_w or cy < 0 or cy > arena_l:
            return True
    return False


# ── Model inference ────────────────────────────────────────────────────────────

def _load_model(cfg: dict, checkpoint_path: str):
    try:
        import torch
        from training_nav.model import NavPolicy
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model  = NavPolicy(cfg).to(device)
        ckpt   = torch.load(checkpoint_path, map_location=device, weights_only=False)
        model.load_state_dict(ckpt['model'])
        model.eval()
        model._hidden = None  # LSTM hidden state; reset per arena
        model._device = device
        model._cfg    = cfg
        print(f'[visualize] model loaded from {os.path.basename(checkpoint_path)}')
        return model
    except Exception as e:
        print(f'[visualize] no model ({e})')
        return None


def _infer(model, terrain_crop: np.ndarray, goal_map: np.ndarray,
           heading: float, phase: str, arena_type_val: float,
           rx: float, ry: float, arena):
    """Run model inference; returns (left, right, bucket) or None."""
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
            out, new_hidden = model(t, h, z, at, ph, hidden=model._hidden)
            model._hidden = (new_hidden[0].detach(), new_hidden[1].detach())
        out = out.squeeze(0).cpu().numpy()
        nav_limit = model._cfg['robot'].get('nav_speed_limit', 0.20)
        left   = float(out[0]) * nav_limit
        right  = float(out[1]) * nav_limit
        bucket = int(np.argmax(out[2:]))
        return left, right, bucket
    except Exception:
        return None


# ── Simulation loop ────────────────────────────────────────────────────────────

_PHASE_SEQ = ['to_excavation', 'digging', 'to_deposit', 'dumping']


def _sim_loop(cfg: dict, checkpoint_path: str, init_seed: int):
    """Continuous simulation loop — runs in a daemon thread."""
    rc         = cfg['robot']
    v_max      = rc['v_max']
    wheel_base = rc['wheel_base']
    robot_w    = rc['robot_width']
    robot_l    = rc['robot_length']
    cs         = cfg['terrain']['cell_size']
    BASE_DT    = 0.12
    REPLAN_N   = 15

    dig_steps  = rc.get('digging_steps',  38)
    dump_steps = rc.get('dumping_steps',  27)
    dig_spd    = rc.get('digging_speed',  0.25)

    model    = (_load_model(cfg, checkpoint_path)
                if checkpoint_path and os.path.exists(checkpoint_path) else None)
    scene_id = 0
    seed     = init_seed

    while True:
        # ── New arena ──────────────────────────────────────────────────────────
        scene_id += 1
        rng    = random.Random(seed)
        np_rng = np.random.default_rng(seed)
        seed  += 1

        arena     = generate_arena(cfg, rng)
        atype_val = 0.0  # KSC default for legacy sim loop
        terrain   = build_terrain_maps(arena, cfg, np_rng)
        cost_full = _build_full_cost_map(terrain, cfg)

        def _rect(r):
            return {'x': r.x, 'y': r.y, 'w': r.w, 'h': r.h}

        with _sim_lock:
            _sim_scene.clear()
            _sim_scene.update({
                'scene_id':    scene_id,
                'arena_w':     arena.width,
                'arena_l':     arena.length,
                'arena_scale': arena.scale,
                't_rows':      terrain['rows'],
                't_cols':      terrain['cols'],
                'cell_size':   cs,
                'terrain_h':   terrain['height'].tolist(),
                'terrain_r':   terrain['rocks'].tolist(),
                'terrain_c':   terrain['craters'].tolist(),
                'terrain_w':   terrain['walls'].tolist(),
                'obstacles':   [{'x': o.x, 'y': o.y, 'd': o.diameter, 'k': o.kind}
                                for o in arena.obstacles],
                'zones': {
                    'start':      _rect(arena.start_zone),
                    'excavation': _rect(arena.excavation_zone),
                    'nav':        _rect(arena.nav_zone),
                    'deposit':    _rect(arena.deposit_zone),
                    'berm':       _rect(arena.berm_target),
                },
            })

        # ── Run full 4-phase curriculum on this arena ──────────────────────────
        phase_idx = 0
        phase     = _PHASE_SEQ[phase_idx]

        goal_zone       = _goal_zone_for_phase(arena, phase)
        rx, ry, heading = _sample_robot_pose(arena, phase, rng)

        gx, gy   = goal_zone.centre()
        goal_rc  = _world_to_cell(gx, gy, cs)
        path_full = astar(cost_full, _world_to_cell(rx, ry, cs), goal_rc) or []

        step          = 0
        phase_step    = 0
        reset_arena   = False
        prev_rx, prev_ry = rx, ry
        stuck_steps   = 0

        while not reset_arena:
            t0 = time.monotonic()
            DT = BASE_DT / max(_timescale[0], 0.05)

            terrain_crop  = crop_robot_view(terrain, rx, ry, cfg)
            goal_map      = build_goal_heatmap(arena, goal_zone, rx, ry, cfg)
            expert_action = plan_action(terrain_crop, goal_map, heading, cfg, phase=phase)
            model_action  = (_infer(model, terrain_crop, goal_map, heading, phase,
                                    atype_val, rx, ry, arena)
                             if model else None)

            # Pick action source
            raw_action  = model_action if model_action is not None else expert_action
            if raw_action is None:
                raw_action = (0.0, 0.0, 0)

            left, right, bucket = raw_action

            # ── Physics update ────────────────────────────────────────────────
            v_left  = left  * v_max
            v_right = right * v_max
            v       = (v_left + v_right) / 2.0
            omega   = (v_right - v_left) / wheel_base
            new_rx  = rx + v * math.cos(heading) * DT
            new_ry  = ry + v * math.sin(heading) * DT
            new_hdg = (heading + omega * DT + math.pi) % (2 * math.pi) - math.pi

            # ── Collision check ───────────────────────────────────────────────
            if (_check_collision(new_rx, new_ry, new_hdg,
                                 robot_w, robot_l, arena.obstacles) or
                    _check_boundary(new_rx, new_ry, new_hdg,
                                    robot_w, robot_l, arena.width, arena.length)):
                reset_arena = True
            else:
                rx, ry, heading = new_rx, new_ry, new_hdg

            # ── Replan A* ─────────────────────────────────────────────────────
            if step % REPLAN_N == 0 and phase not in ('digging', 'dumping'):
                path_full = astar(cost_full, _world_to_cell(rx, ry, cs), goal_rc) or []

            # ── Publish state ─────────────────────────────────────────────────
            with _sim_lock:
                _sim_state.update({
                    'scene_id':    scene_id,
                    'rx':          rx,
                    'ry':          ry,
                    'heading':     heading,
                    'left':        left,
                    'right':       right,
                    'bucket':      bucket,
                    'phase':       phase,
                    'phase_step':  phase_step,
                    'expert':      list(expert_action) if expert_action else None,
                    'model':       list(model_action)  if model_action  else None,
                    'using_model': model_action is not None,
                    'path_world':  [[r * cs, c * cs] for r, c in path_full],
                    'step':        step,
                    'v':           v,
                    'omega':       omega,
                    'goal_x':      gx,
                    'goal_y':      gy,
                    'collided':    reset_arena,
                    'timescale':   _timescale[0],
                    'crop_h':      terrain_crop[0].tolist(),
                    'crop_r':      terrain_crop[1].tolist(),
                    'crop_c':      terrain_crop[2].tolist(),
                    'crop_w':      terrain_crop[3].tolist(),
                    'goal_map':    goal_map.tolist(),
                })

            if reset_arena:
                time.sleep(0.8)
                break

            step      += 1
            phase_step += 1

            # ── Phase transition logic ─────────────────────────────────────────
            advance_phase = False

            if phase == 'to_excavation':
                if arena.excavation_zone.contains(rx, ry):
                    advance_phase = True

            elif phase == 'digging':
                if phase_step >= dig_steps:
                    advance_phase = True

            elif phase == 'to_deposit':
                if arena.deposit_zone.contains(rx, ry):
                    advance_phase = True

            elif phase == 'dumping':
                if phase_step >= dump_steps:
                    advance_phase = True

            if advance_phase:
                phase_step = 0
                phase_idx  = (phase_idx + 1) % len(_PHASE_SEQ)
                phase      = _PHASE_SEQ[phase_idx]
                goal_zone  = _goal_zone_for_phase(arena, phase)
                gx, gy     = goal_zone.centre()
                goal_rc    = _world_to_cell(gx, gy, cs)
                path_full  = (astar(cost_full, _world_to_cell(rx, ry, cs), goal_rc) or []
                              if phase not in ('digging', 'dumping') else [])
                # Brief pause so UI can show the new phase label
                time.sleep(0.4 / max(_timescale[0], 0.05))

            # ── Stuck detection ───────────────────────────────────────────────
            if step % 20 == 0:
                dist = math.hypot(rx - prev_rx, ry - prev_ry)
                if dist < 0.05:
                    stuck_steps += 1
                    if stuck_steps >= 5:
                        reset_arena = True
                        break
                else:
                    stuck_steps = 0
                prev_rx, prev_ry = rx, ry

            sleep_t = DT - (time.monotonic() - t0)
            time.sleep(max(0.0, sleep_t))


# ── HTML template ──────────────────────────────────────────────────────────────

_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OCTANE — Nav Policy</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #111;
  color: #e0e0e0;
  font-family: -apple-system, 'Segoe UI', sans-serif;
  font-size: 13px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 18px;
  background: #0d0d0d;
  border-bottom: 1px solid #252525;
  flex-shrink: 0;
}
.logo {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: .14em;
  color: #fff;
  background: #1b381b;
  border: 1px solid rgba(46,204,64,.5);
  padding: 3px 11px;
  border-radius: 2px;
  flex-shrink: 0;
}
.badge {
  padding: 2px 9px;
  border-radius: 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.badge-model  { background: rgba(46,204,64,.14); color: #2ecc40; border: 1px solid rgba(46,204,64,.4); }
.badge-expert { background: rgba(255,200,0,.10); color: #d4a820; border: 1px solid rgba(255,200,0,.3); }
.badge-ksc    { background: rgba(46,204,64,.12); color: #2ecc40; border: 1px solid rgba(46,204,64,.35); }
.badge-ucf    { background: rgba(255,140,0,.12); color: #ff9800; border: 1px solid rgba(255,140,0,.35); }
.badge-epoch  { background: rgba(100,160,255,.10); color: #7ab4ff; border: 1px solid rgba(100,160,255,.3); }
#statusDot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #2ecc40; box-shadow: 0 0 5px #2ecc40;
  flex-shrink: 0;
}
#statusDot.collision { background: #e74c3c; box-shadow: 0 0 7px #e74c3c; }
.header-right { margin-left: auto; display: flex; gap: 14px; align-items: center; }
.hval { font-size: 11px; color: #555; }
.hval strong { color: #bbb; font-family: 'Courier New', monospace; letter-spacing: .03em; }

.workspace {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.arena-wrap {
  position: relative;
  background: #0a0a0a;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
#arenaCanvas { display: block; }
.arena-overlay {
  position: absolute;
  top: 12px; left: 14px;
  font-size: 10px;
  color: #333;
  letter-spacing: .08em;
  text-transform: uppercase;
  pointer-events: none;
  font-family: 'Courier New', monospace;
}
.arena-overlay strong { color: #555; }

.side {
  display: flex;
  flex-direction: column;
  background: #181818;
  border-left: 1px solid #252525;
  overflow-y: auto;
}
.panel { padding: 14px 16px; border-bottom: 1px solid #252525; }
.panel-title {
  font-size: 9px; font-weight: 700; letter-spacing: .14em;
  text-transform: uppercase; color: #444; margin-bottom: 12px;
}

.crop-wrap { display: flex; justify-content: center; }
#cropCanvas { border-radius: 2px; display: block; }

.bucket-row { display: flex; gap: 6px; margin-bottom: 4px; }
.bucket-pip {
  flex: 1; text-align: center; padding: 5px 0; border-radius: 2px;
  font-size: 9px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; border: 1px solid #252525;
  color: #3a3a3a; background: #111;
  transition: background .15s, color .15s, border-color .15s;
}
.bucket-pip.active-0 { background: rgba(46,204,64,.14); color: #2ecc40; border-color: rgba(46,204,64,.4); }
.bucket-pip.active-1 { background: rgba(255,160,0,.18); color: #ffa010; border-color: rgba(255,160,0,.45); }
.bucket-pip.active-2 { background: rgba(231,76,60,.16); color: #e74c3c; border-color: rgba(231,76,60,.45); }

.phase-bar-wrap {
  height: 3px; background: #111; border-radius: 1px; margin-top: 8px; overflow: hidden;
}
.phase-bar-fill { height: 100%; border-radius: 1px; transition: width .12s, background .15s; }

.motor-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.motor-label { width: 14px; font-size: 10px; font-weight: 700; letter-spacing: .06em; color: #555; flex-shrink: 0; }
.motor-track { flex: 1; height: 6px; background: #111; border-radius: 1px; overflow: hidden; border: 1px solid #252525; }
.motor-fill  { height: 100%; border-radius: 1px; background: linear-gradient(90deg, #1a7a28, #2ecc40); transition: width .1s; }
.motor-val   { width: 36px; text-align: right; font-size: 12px; font-weight: 700; color: #2ecc40; font-family: 'Courier New', monospace; }
.motor-speed { font-size: 10px; color: #3a3a3a; text-align: right; margin-top: -6px; margin-bottom: 8px; font-family: 'Courier New', monospace; }
.divider     { height: 1px; background: #252525; margin: 10px 0; }

.cmp-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; font-size: 11px; }
.cmp-key { color: #444; }
.cmp-val-expert { color: #d4a820; font-family: 'Courier New', monospace; }
.cmp-val-model  { color: #2ecc40; font-family: 'Courier New', monospace; }

.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
.info-item { display: flex; flex-direction: column; gap: 1px; }
.info-key { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #444; }
.info-val { font-size: 12px; color: #bbb; font-family: 'Courier New', monospace; }

footer {
  display: flex; align-items: center; gap: 12px;
  padding: 6px 18px;
  background: #0d0d0d;
  border-top: 1px solid #252525;
  flex-shrink: 0; flex-wrap: wrap;
}
select, input[type=range] {
  background: #1a1a1a; color: #e0e0e0;
  border: 1px solid #2e2e2e; border-radius: 2px;
  padding: 4px 8px; font-size: 12px;
}
input[type=range] { padding: 0; cursor: pointer; accent-color: #2ecc40; }
button {
  background: #1a1a1a; color: #aaa;
  border: 1px solid #2e2e2e; border-radius: 2px;
  padding: 4px 14px; font-size: 11px; cursor: pointer;
  letter-spacing: .06em; text-transform: uppercase;
}
button:hover { background: #1e1e1e; border-color: #2ecc40; color: #2ecc40; }
.footer-right { margin-left: auto; font-size: 11px; color: #3a3a3a; font-family: 'Courier New', monospace; }
.ts-label { font-size: 11px; color: #555; white-space: nowrap; }
#tsVal { color: #bbb; font-weight: 600; min-width: 32px; display: inline-block; font-family: 'Courier New', monospace; }
</style>
</head>
<body>

<header>
  <div class="logo">OCTANE</div>
  <span style="color:#333;font-size:10px;letter-spacing:.1em;text-transform:uppercase">Navigation Policy</span>
  <span class="badge badge-expert" id="modeBadge">A* EXPERT</span>
  <span class="badge badge-epoch" id="epochBadge" style="display:none"></span>
  <span class="badge badge-ksc" id="arenaBadge">KSC</span>
  <div id="statusDot"></div>
  <div class="header-right">
    <span class="hval">v <strong id="hVel">—</strong> m/s</span>
    <span class="hval">ω <strong id="hOmega">—</strong> rad/s</span>
    <span class="hval">hdg <strong id="hHdg">—</strong>°</span>
    <span class="hval" id="hPos">—</span>
  </div>
</header>

<div class="workspace">
  <div class="arena-wrap" id="arenaWrap">
    <canvas id="arenaCanvas"></canvas>
    <div class="arena-overlay" id="arenaOverlay">—</div>
  </div>

  <div class="side">

    <div class="panel">
      <div class="panel-title">Sensor view</div>
      <div class="crop-wrap">
        <canvas id="cropCanvas" width="268" height="268"></canvas>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Bucket &amp; phase</div>
      <div class="bucket-row">
        <div class="bucket-pip" id="bPip0">UP</div>
        <div class="bucket-pip" id="bPip1">COLLECT</div>
        <div class="bucket-pip" id="bPip2">DUMP</div>
      </div>
      <div class="phase-bar-wrap">
        <div class="phase-bar-fill" id="phaseBarFill" style="width:0%"></div>
      </div>
      <div style="font-size:10px;color:#484f58;margin-top:6px" id="phaseLabel">—</div>
    </div>

    <div class="panel">
      <div class="panel-title">Drive motors</div>

      <div class="motor-row">
        <span class="motor-label">L</span>
        <div class="motor-track"><div class="motor-fill" id="motorLFill" style="width:0%"></div></div>
        <span class="motor-val" id="motorLVal">—</span>
      </div>
      <div class="motor-speed" id="motorLSpd">—</div>

      <div class="motor-row">
        <span class="motor-label">R</span>
        <div class="motor-track"><div class="motor-fill" id="motorRFill" style="width:0%"></div></div>
        <span class="motor-val" id="motorRVal">—</span>
      </div>
      <div class="motor-speed" id="motorRSpd">—</div>

      <div class="divider"></div>

      <div class="cmp-row">
        <span class="cmp-key">Expert (A*)</span>
        <span class="cmp-val-expert" id="cmpExpert">—</span>
      </div>
      <div class="cmp-row">
        <span class="cmp-key">Model</span>
        <span class="cmp-val-model" id="cmpModel">—</span>
      </div>
    </div>

    <div class="panel" style="flex:1">
      <div class="panel-title">Arena info</div>
      <div class="info-grid">
        <div class="info-item"><span class="info-key">Layout</span><span class="info-val" id="iLayout">—</span></div>
        <div class="info-item"><span class="info-key">Scale</span><span class="info-val" id="iSc">—</span></div>
        <div class="info-item"><span class="info-key">Width</span><span class="info-val" id="iW">—</span></div>
        <div class="info-item"><span class="info-key">Length</span><span class="info-val" id="iL">—</span></div>
        <div class="info-item"><span class="info-key">Obstacles</span><span class="info-val" id="iObs">—</span></div>
        <div class="info-item"><span class="info-key">Robot X</span><span class="info-val" id="iRx">—</span></div>
        <div class="info-item"><span class="info-key">Robot Y</span><span class="info-val" id="iRy">—</span></div>
        <div class="info-item"><span class="info-key">Phase</span><span class="info-val" id="iPhase">—</span></div>
        <div class="info-item"><span class="info-key">Step</span><span class="info-val" id="iStep">—</span></div>
      </div>
    </div>

  </div>
</div>

<footer>
  <button onclick="newArena()">New Arena</button>
  <label class="ts-label">
    Timescale&nbsp;<span id="tsVal">1.0×</span>
    <input type="range" id="tsSlider" min="0.1" max="5" step="0.1" value="1"
           style="width:110px;margin-left:6px"
           oninput="onTimescale(this.value)">
  </label>
  <div class="footer-right" id="footerRight">—</div>
</footer>

<script>
// ── Constants (injected by Python server) ──────────────────────────────────────
const V_MAX      = _V_MAX_;
const WHEEL_BASE = _WHEEL_BASE_;
const ROBOT_W    = _ROBOT_W_;
const ROBOT_L    = _ROBOT_L_;
const PROJ_TIME  = _PROJ_TIME_;
const DIFF_LIMIT = _DIFF_LIMIT_;
const GS         = _GS_;
const VIEW_W     = _VIEW_W_;
const VIEW_H     = _VIEW_H_;
const VIEW_L     = VIEW_H;
const DIG_STEPS  = _DIG_STEPS_;
const DUMP_STEPS = _DUMP_STEPS_;

const PHASE_MAX = {
  to_excavation: null,
  digging:       DIG_STEPS,
  to_deposit:    null,
  dumping:       DUMP_STEPS,
};
const PHASE_BUCKET = {
  to_excavation: 0, digging: 1, to_deposit: 0, dumping: 2,
};
const PHASE_BAR_COLOR = {
  to_excavation: '#2ecc40',
  digging:       '#f39c12',
  to_deposit:    '#2ecc40',
  dumping:       '#27ae60',
};

// ── State ──────────────────────────────────────────────────────────────────────
let scene       = null;
let state       = null;
let lastSceneId = -1;

// ── Polling ────────────────────────────────────────────────────────────────────
async function pollState() {
  try {
    const r = await fetch('/api/state');
    const s = await r.json();
    state = s;
    if (s.scene_id !== lastSceneId) {
      lastSceneId = s.scene_id;
      const sr = await fetch('/api/scene');
      scene = await sr.json();
    }
  } catch(e) {}
}
setInterval(pollState, 100);

// ── Render loop ────────────────────────────────────────────────────────────────
function raf() {
  requestAnimationFrame(raf);
  if (!state || !scene || state.rx == null || !scene.arena_w) return;
  drawArena();
  drawCrop();
  updateUI();
}
requestAnimationFrame(raf);

// ── Coordinate helpers ─────────────────────────────────────────────────────────
function w2c(wx, wy, W, H) {
  return { x: wx / scene.arena_w * W,
           y: (1 - wy / scene.arena_l) * H };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t)    { return a + (b - a) * t; }

// ── Kinematic projection ───────────────────────────────────────────────────────
function _boostCmds(left, right) {
  // Ensure a minimum arc length for stopped/near-stopped states (dumping phase etc).
  const MIN = 0.08, avg = (Math.abs(left) + Math.abs(right)) / 2;
  if (avg < 1e-3) return [MIN, MIN];
  if (avg >= MIN)  return [left, right];
  const s = MIN / avg;
  return [Math.max(-1, Math.min(1, left*s)), Math.max(-1, Math.min(1, right*s))];
}

function projectArc(rx, ry, heading, left, right) {
  const [bL, bR] = _boostCmds(left, right);
  const DT = 0.06, steps = Math.round(PROJ_TIME / DT);
  const x0 = rx + (ROBOT_L / 2) * Math.cos(heading);
  const y0 = ry + (ROBOT_L / 2) * Math.sin(heading);
  const pts = [{x: x0, y: y0}];
  let x = x0, y = y0, h = heading;
  for (let i = 0; i < steps; i++) {
    const vL = bL * V_MAX, vR = bR * V_MAX;
    const v  = (vL + vR) / 2, w = (vR - vL) / WHEEL_BASE;
    x += v * Math.cos(h) * DT;
    y += v * Math.sin(h) * DT;
    h += w * DT;
    pts.push({x, y});
  }
  return pts;
}

function projectArcGrid(heading, left, right) {
  const [bL, bR] = _boostCmds(left, right);
  const CSX = VIEW_W / GS, CSY = VIEW_H / GS;
  const DT = 0.06, steps = Math.round(PROJ_TIME / DT);
  const half = GS / 2;
  const col0 = half + (ROBOT_L / 2) / CSX * Math.cos(heading);
  const row0 = half - (ROBOT_L / 2) / CSY * Math.sin(heading);
  const pts = [{col: col0, row: row0}];
  let col = col0, row = row0, h = heading;
  for (let i = 0; i < steps; i++) {
    const vL = bL * V_MAX, vR = bR * V_MAX;
    const v  = (vL + vR) / 2, w = (vR - vL) / WHEEL_BASE;
    col +=  v * Math.cos(h) * DT / CSX;
    row += -v * Math.sin(h) * DT / CSY;
    h   +=  w * DT;
    if (row < 0 || row >= GS || col < 0 || col >= GS) break;
    pts.push({col, row});
  }
  return pts;
}

// ── Vehicle-width arc ──────────────────────────────────────────────────────────
function drawVehicleArc(ctx, pts, halfWidthPx) {
  if (pts.length < 2) return;
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    let dx, dy;
    if (i === 0)              { dx = pts[1].x-pts[0].x;    dy = pts[1].y-pts[0].y; }
    else if (i===pts.length-1){ dx = pts[i].x-pts[i-1].x; dy = pts[i].y-pts[i-1].y; }
    else                      { dx = pts[i+1].x-pts[i-1].x; dy = pts[i+1].y-pts[i-1].y; }
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy/len, ny = dx/len;
    left.push ({x: pts[i].x+nx*halfWidthPx, y: pts[i].y+ny*halfWidthPx});
    right.push({x: pts[i].x-nx*halfWidthPx, y: pts[i].y-ny*halfWidthPx});
  }
  const n = pts.length;
  const grad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[n-1].x, pts[n-1].y);
  grad.addColorStop(0,    'rgba(46,204,64,0.72)');
  grad.addColorStop(0.12, 'rgba(46,204,64,0.50)');
  grad.addColorStop(0.45, 'rgba(46,204,64,0.16)');
  grad.addColorStop(1,    'rgba(46,204,64,0.00)');
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of left)  ctx.lineTo(p.x, p.y);
  for (let i = right.length-1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  const cGrad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[n-1].x, pts[n-1].y);
  cGrad.addColorStop(0,    'rgba(100,230,120,0.95)');
  cGrad.addColorStop(0.12, 'rgba(100,230,120,0.75)');
  cGrad.addColorStop(0.5,  'rgba(100,230,120,0.35)');
  cGrad.addColorStop(1,    'rgba(100,230,120,0.00)');
  ctx.beginPath();
  pts.forEach((p, i) => i===0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = cGrad; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
}

// ── Rounded robot rectangle ────────────────────────────────────────────────────
function drawRoundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x+w, y,   x+w, y+h,   r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x+w, y+h, x,   y+h,   r);
  ctx.lineTo(x + r,   y + h);
  ctx.arcTo(x,   y+h, x,   y,     r);
  ctx.lineTo(x,       y + r);
  ctx.arcTo(x,   y,   x+w, y,     r);
  ctx.closePath();
}

function drawRobotRect(ctx, cx, cy, lPx, wPx, heading) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-heading);
  const radius = Math.min(4, lPx * 0.1);

  // Glow
  ctx.shadowColor = '#2ecc40';
  ctx.shadowBlur  = 16;
  ctx.fillStyle   = 'rgba(46,204,64,0.07)';
  drawRoundRect(ctx, -lPx/2-4, -wPx/2-4, lPx+8, wPx+8, radius+2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Body fill
  ctx.fillStyle   = '#d0d5d8';
  ctx.strokeStyle = '#2ecc40';
  ctx.lineWidth   = 1.5;
  drawRoundRect(ctx, -lPx/2, -wPx/2, lPx, wPx, radius);
  ctx.fill();
  ctx.stroke();

  // Front panel
  const panelW = Math.max(3, lPx * 0.08);
  ctx.fillStyle = '#2ecc40';
  ctx.fillRect(lPx/2 - panelW, -wPx/2, panelW, wPx);

  ctx.restore();
}

// ── Heatmap colour ─────────────────────────────────────────────────────────────
function heatColor(v, lo, hi) {
  const t = clamp((v-lo)/(hi-lo+1e-9), 0, 1);
  if (t < 0.5) {
    const s = t*2;
    return `rgb(${Math.round(lerp(10,0,s))},${Math.round(lerp(20,120,s))},${Math.round(lerp(40,160,s))})`;
  }
  const s = (t-0.5)*2;
  return `rgb(${Math.round(lerp(0,200,s))},${Math.round(lerp(120,160,s))},${Math.round(lerp(160,20,s))})`;
}
function flatMinMax(arr2d) {
  let mn=Infinity, mx=-Infinity;
  for (const row of arr2d) for (const v of row) { if(v<mn)mn=v; if(v>mx)mx=v; }
  return [mn, mx];
}

// ── Full Arena Canvas ──────────────────────────────────────────────────────────
function drawArena() {
  const wrap = document.getElementById('arenaWrap');
  const canvas = document.getElementById('arenaCanvas');
  const maxW = wrap.clientWidth, maxH = wrap.clientHeight;
  const ratio = scene.arena_w / scene.arena_l;
  let W, H;
  if (maxW/maxH > ratio) { H=maxH; W=H*ratio; } else { W=maxW; H=W/ratio; }
  if (canvas.width!==Math.floor(W)||canvas.height!==Math.floor(H)) {
    canvas.width=Math.floor(W); canvas.height=Math.floor(H);
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#090d14'; ctx.fillRect(0,0,W,H);

  // Grid
  const GRID_M=0.5;
  ctx.strokeStyle='rgba(255,255,255,0.025)'; ctx.lineWidth=0.5;
  for (let gx=0; gx<=scene.arena_w; gx+=GRID_M) {
    const px=gx/scene.arena_w*W;
    ctx.beginPath(); ctx.moveTo(px,0); ctx.lineTo(px,H); ctx.stroke();
  }
  for (let gy=0; gy<=scene.arena_l; gy+=GRID_M) {
    const py=(1-gy/scene.arena_l)*H;
    ctx.beginPath(); ctx.moveTo(0,py); ctx.lineTo(W,py); ctx.stroke();
  }

  // Height map
  const [hMin,hMax] = flatMinMax(scene.terrain_h);
  const rows=scene.t_rows, cols=scene.t_cols;
  const cellW=W/cols, cellH=H/rows;
  for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) {
    const t=(scene.terrain_h[r][c]-hMin)/(hMax-hMin+1e-9);
    const v=Math.round(lerp(6,28,t));
    ctx.fillStyle=`rgb(${v},${v+1},${v+3})`;
    ctx.fillRect(c*cellW,(rows-1-r)*cellH,cellW+1,cellH+1);
  }

  // Wall channel — rendered the way the terrain-perception model sees it
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
    if (scene.terrain_w[r][c]>0.5) {
      ctx.fillStyle='rgba(210,170,55,0.62)';
      ctx.fillRect(c*cellW,(rows-1-r)*cellH,cellW+1,cellH+1);
    }
  }

  // Zone overlays
  const ZC = { start:'rgba(30,100,60,.28)', excavation:'rgba(100,60,0,.22)',
               nav:'rgba(10,40,90,.22)', deposit:'rgba(70,10,90,.22)', berm:'rgba(180,140,0,.15)' };
  const ZL = { start:'START', excavation:'EXCAVATION', nav:'NAV', deposit:'DEPOSIT', berm:'BERM' };
  const ZBC= { start:'rgba(30,100,60,.5)', excavation:'rgba(140,80,0,.45)',
               nav:'rgba(20,70,160,.45)', deposit:'rgba(100,20,130,.45)', berm:'rgba(200,160,0,.5)' };
  for (const [key,color] of Object.entries(ZC)) {
    const z=scene.zones[key];
    const tl=w2c(z.x,z.y+z.h,W,H), br=w2c(z.x+z.w,z.y,W,H);
    const zw=br.x-tl.x, zh=br.y-tl.y;
    ctx.fillStyle=color; ctx.fillRect(tl.x,tl.y,zw,zh);
    ctx.strokeStyle=ZBC[key]; ctx.lineWidth=key==='berm'?1.5:1;
    if(key==='berm') ctx.setLineDash([5,3]);
    ctx.strokeRect(tl.x+.5,tl.y+.5,zw-1,zh-1); ctx.setLineDash([]);
    ctx.fillStyle='rgba(255,255,255,0.12)';
    ctx.font=`${clamp(Math.floor(W/40),7,11)}px -apple-system,sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(ZL[key],(tl.x+br.x)/2,(tl.y+br.y)/2);
  }

  // Obstacles
  for (const o of scene.obstacles) {
    const p=w2c(o.x,o.y,W,H);
    const rr=Math.max(3,(o.d/2)/scene.arena_w*W);
    ctx.beginPath(); ctx.arc(p.x,p.y,rr,0,2*Math.PI);
    if (o.k==='rock') { ctx.fillStyle='rgba(120,120,130,0.6)'; ctx.strokeStyle='rgba(160,160,175,0.8)'; }
    else if (o.k==='column') { ctx.fillStyle='rgba(80,80,100,0.8)'; ctx.strokeStyle='rgba(140,140,160,0.9)'; }
    else { ctx.fillStyle='rgba(55,40,40,0.7)'; ctx.strokeStyle='rgba(90,60,60,0.9)'; }
    ctx.fill(); ctx.lineWidth=1; ctx.stroke();
  }

  // Sensor view rectangle
  const vx0=state.rx-VIEW_W/2, vy0=state.ry-VIEW_H/2;
  const vTL=w2c(vx0,vy0+VIEW_H,W,H), vBR=w2c(vx0+VIEW_W,vy0,W,H);
  const vRW=vBR.x-vTL.x, vRH=vBR.y-vTL.y;
  ctx.fillStyle='rgba(255,255,255,0.025)'; ctx.fillRect(vTL.x,vTL.y,vRW,vRH);
  ctx.strokeStyle='rgba(46,204,64,0.22)'; ctx.lineWidth=0.75;
  ctx.setLineDash([5,4]); ctx.strokeRect(vTL.x+.5,vTL.y+.5,vRW-1,vRH-1); ctx.setLineDash([]);

  // A* world path
  if (state.path_world && state.path_world.length > 1) {
    ctx.shadowColor='rgba(255,215,0,0.4)'; ctx.shadowBlur=4;
    ctx.beginPath();
    state.path_world.forEach(([wy,wx],i)=>{
      const p=w2c(wx,wy,W,H); i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);
    });
    ctx.strokeStyle='rgba(212,168,32,0.8)'; ctx.lineWidth=1.5; ctx.lineJoin='round';
    ctx.stroke(); ctx.shadowBlur=0;
  }

  // Tesla arc
  const arcPts=projectArc(state.rx,state.ry,state.heading,state.left,state.right);
  const cArcPts=arcPts.map(p=>w2c(p.x,p.y,W,H));
  const halfWPx=(ROBOT_W/scene.arena_w)*W/4;
  drawVehicleArc(ctx,cArcPts,halfWPx);

  // Robot
  const rp=w2c(state.rx,state.ry,W,H);
  const lPx=(ROBOT_L/scene.arena_l)*H, wPx=(ROBOT_W/scene.arena_w)*W;
  drawRobotRect(ctx,rp.x,rp.y,lPx,wPx,state.heading);
}

// ── Sensor crop canvas ─────────────────────────────────────────────────────────
function drawCrop() {
  if (!state.crop_h) return;
  const canvas=document.getElementById('cropCanvas');
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  const cW=W/GS, cH=H/GS;
  ctx.clearRect(0,0,W,H);
  // Flip Y: crop row 0 = world south; render with row 0 at canvas bottom so north = top,
  // matching the arena canvas convention used by projectArcGrid and drawRobotRect.
  const [hMin,hMax]=flatMinMax(state.crop_h);
  for (let r=0;r<GS;r++) for (let c=0;c<GS;c++) {
    const cy=(GS-1-r)*cH;
    ctx.fillStyle=heatColor(state.crop_h[r][c],hMin,hMax);
    ctx.fillRect(c*cW,cy,cW+.5,cH+.5);
  }
  for (let r=0;r<GS;r++) for (let c=0;c<GS;c++) {
    const cy=(GS-1-r)*cH;
    const v=state.crop_r[r][c];
    if(v>0.05){ctx.fillStyle=`rgba(120,120,135,${v*0.6})`;ctx.fillRect(c*cW,cy,cW+.5,cH+.5);}
  }
  for (let r=0;r<GS;r++) for (let c=0;c<GS;c++) {
    const cy=(GS-1-r)*cH;
    const v=state.crop_c[r][c];
    if(v>0.05){ctx.fillStyle=`rgba(50,35,35,${v*0.7})`;ctx.fillRect(c*cW,cy,cW+.5,cH+.5);}
  }
  for (let r=0;r<GS;r++) for (let c=0;c<GS;c++) {
    const cy=(GS-1-r)*cH;
    if(state.crop_w[r][c]>0.5){ctx.fillStyle='rgba(50,50,60,0.9)';ctx.fillRect(c*cW,cy,cW+.5,cH+.5);}
  }
  for (let r=0;r<GS;r++) for (let c=0;c<GS;c++) {
    const cy=(GS-1-r)*cH;
    const v=state.goal_map[r][c];
    if(v>0.02){ctx.fillStyle=`rgba(46,160,67,${v*0.45})`;ctx.fillRect(c*cW,cy,cW+.5,cH+.5);}
  }
  const gridPts=projectArcGrid(state.heading,state.left,state.right);
  const cArcPts=gridPts.map(p=>({x:(p.col+0.5)*cW,y:(p.row+0.5)*cH}));
  const halfWPx=(GS/VIEW_W*ROBOT_W)/4*cW;
  drawVehicleArc(ctx,cArcPts,halfWPx);
  const cx=(GS/2+0.5)*cW, cy=(GS/2+0.5)*cH;
  const lPx=(ROBOT_L/VIEW_L)*H, wPx=(ROBOT_W/VIEW_W)*W;
  drawRobotRect(ctx,cx,cy,lPx,wPx,state.heading);
}

// ── UI panel updates ───────────────────────────────────────────────────────────
function setMotor(fillId, valId, spdId, v) {
  document.getElementById(fillId).style.width=(v*100).toFixed(1)+'%';
  document.getElementById(valId).textContent=v.toFixed(2);
  const rpm=(v*35).toFixed(1), mps=(v*V_MAX).toFixed(3);
  document.getElementById(spdId).textContent=`${rpm} RPM  ·  ${mps} m/s`;
}

function updateUI() {
  document.getElementById('hVel').textContent   = state.v.toFixed(3);
  document.getElementById('hOmega').textContent = state.omega.toFixed(3);
  document.getElementById('hHdg').textContent   = (state.heading*180/Math.PI).toFixed(1);
  document.getElementById('hPos').textContent   = `(${state.rx.toFixed(2)}, ${state.ry.toFixed(2)}) m`;

  const dot = document.getElementById('statusDot');
  dot.className = state.collided ? 'collision' : '';

  setMotor('motorLFill','motorLVal','motorLSpd',state.left);
  setMotor('motorRFill','motorRVal','motorRSpd',state.right);

  const fmt = a => a ? `L=${a[0].toFixed(2)} R=${a[1].toFixed(2)}` : '—';
  document.getElementById('cmpExpert').textContent = fmt(state.expert);
  document.getElementById('cmpModel').textContent  = state.model ? fmt(state.model) : 'no model';

  const badge = document.getElementById('modeBadge');
  if (state.using_model) { badge.textContent='MODEL'; badge.className='badge badge-model'; }
  else                   { badge.textContent='A* EXPERT'; badge.className='badge badge-expert'; }

  const ep = document.getElementById('epochBadge');
  if (state.model_epoch) { ep.textContent=state.model_epoch; ep.style.display=''; }
  else                   { ep.style.display='none'; }

  // Bucket pips
  const bucket = state.bucket ?? 0;
  for (let i=0; i<3; i++) {
    const el = document.getElementById(`bPip${i}`);
    el.className = 'bucket-pip' + (i===bucket ? ` active-${bucket}` : '');
  }

  // Phase bar
  const phase    = state.phase || 'to_excavation';
  const maxSteps = PHASE_MAX[phase];
  const pct      = maxSteps ? Math.min(100, (state.phase_step||0)/maxSteps*100) : 0;
  const bar      = document.getElementById('phaseBarFill');
  bar.style.width     = pct + '%';
  bar.style.background = PHASE_BAR_COLOR[phase] || '#148ce8';
  document.getElementById('phaseLabel').textContent =
    phase.replace('_',' ').toUpperCase() +
    (maxSteps ? `  ${state.phase_step||0}/${maxSteps}` : '');

  if (scene) {
    const rocks  =scene.obstacles.filter(o=>o.k==='rock').length;
    const craters=scene.obstacles.filter(o=>o.k==='crater').length;
    const atype  =(scene.arena_type||'ksc').toUpperCase();
    document.getElementById('iLayout').textContent=atype;
    document.getElementById('iW').textContent   =scene.arena_w.toFixed(2)+' m';
    document.getElementById('iL').textContent   =scene.arena_l.toFixed(2)+' m';
    document.getElementById('iSc').textContent  =(scene.arena_scale*100).toFixed(0)+'%';
    document.getElementById('iObs').textContent =`${rocks}r ${craters}c`;
    const ab=document.getElementById('arenaBadge');
    ab.textContent=atype; ab.className='badge badge-'+(scene.arena_type||'ksc');
    document.getElementById('iRx').textContent  =state.rx.toFixed(2)+' m';
    document.getElementById('iRy').textContent  =state.ry.toFixed(2)+' m';
    document.getElementById('iPhase').textContent=state.phase;
    document.getElementById('iStep').textContent =state.step;

    document.getElementById('arenaOverlay').innerHTML =
      `<strong>${scene.arena_w.toFixed(2)}m × ${scene.arena_l.toFixed(2)}m</strong>`+
      `  ·  scale ${(scene.arena_scale*100).toFixed(0)}%`+
      `  ·  scene #${scene.scene_id}`;

    document.getElementById('footerRight').textContent =
      `v_max=${V_MAX} m/s  ·  wheel_base=${WHEEL_BASE} m  ·  diff_limit=${DIFF_LIMIT}`;
  }
}

// ── Controls ───────────────────────────────────────────────────────────────────
async function newArena() {
  await fetch('/api/reset');
}
function onTimescale(val) {
  const ts = parseFloat(val);
  document.getElementById('tsVal').textContent = ts.toFixed(1) + '×';
  fetch('/api/timescale?v=' + ts);
}
document.addEventListener('keydown', e => {
  if (e.key==='r'||e.key==='R') newArena();
});

// kick off first poll immediately
pollState();
</script>
</body>
</html>
"""


# ── HTTP server ────────────────────────────────────────────────────────────────

def _serve(cfg: dict, args: argparse.Namespace):
    rc = cfg['robot']

    html = (
        _HTML
        .replace('_V_MAX_',      str(rc['v_max']))
        .replace('_WHEEL_BASE_', str(rc['wheel_base']))
        .replace('_ROBOT_W_',    str(rc['robot_width']))
        .replace('_ROBOT_L_',    str(rc['robot_length']))
        .replace('_PROJ_TIME_',  str(rc['projection_time']))
        .replace('_DIFF_LIMIT_', str(rc['diff_limit']))
        .replace('_GS_',         str(cfg['terrain']['grid_size']))
        .replace('_VIEW_W_',     str(cfg['terrain']['view_width']))
        .replace('_VIEW_H_',     str(cfg['terrain']['view_height']))
        .replace('_DIG_STEPS_',  str(rc.get('digging_steps',  38)))
        .replace('_DUMP_STEPS_', str(rc.get('dumping_steps',  27)))
    )

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_): pass

        def do_GET(self):
            from urllib.parse import parse_qs, urlparse
            parsed = urlparse(self.path)
            qs     = parse_qs(parsed.query)
            path   = parsed.path

            if path == '/':
                self._send_html(html)

            elif path == '/api/state':
                with _sim_lock:
                    s = dict(_sim_state)
                self._send_json(s)

            elif path == '/api/scene':
                with _sim_lock:
                    sc = dict(_sim_scene)
                self._send_json(sc)

            elif path == '/api/reset':
                # Signal sim thread to move to next arena by incrementing seed
                # (sim detects this via a flag set in _timescale[1])
                _timescale[0] = _timescale[0]   # no-op; reset happens via stuck detection
                # The simplest reset: modify a shared list the sim thread checks
                _reset_req[0] = True
                self._send_json({'ok': True})

            elif path == '/api/timescale':
                try:
                    v = float(qs.get('v', ['1'])[0])
                    _timescale[0] = max(0.05, min(10.0, v))
                except (ValueError, KeyError):
                    pass
                self._send_json({'timescale': _timescale[0]})

            else:
                self.send_error(404)

        def _send_html(self, body: str):
            enc = body.encode()
            self.send_response(200)
            self.send_header('Content-Type',   'text/html; charset=utf-8')
            self.send_header('Content-Length', len(enc))
            self.end_headers()
            self.wfile.write(enc)

        def _send_json(self, obj):
            enc = json.dumps(obj).encode()
            self.send_response(200)
            self.send_header('Content-Type',   'application/json')
            self.send_header('Content-Length', len(enc))
            self.send_header('Cache-Control',  'no-cache')
            self.end_headers()
            self.wfile.write(enc)

    server = http.server.HTTPServer(('localhost', args.port), Handler)
    url    = f'http://localhost:{args.port}'
    print(f'[visualize]  {url}  (press R to reset arena,  Ctrl+C to stop)')
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


# ── Entry point ────────────────────────────────────────────────────────────────

_reset_req = [False]


def _sim_loop_guarded(cfg: dict, checkpoint_path: str, init_seed: int,
                      arena_override: str | None = None):
    """Wrapper that restarts _sim_loop_with_reset on unhandled exceptions."""
    seed = init_seed
    while True:
        try:
            _sim_loop_with_reset(cfg, checkpoint_path, seed, arena_override)
        except Exception:
            traceback.print_exc()
            time.sleep(1.0)
        seed += 1


def _sim_loop_with_reset(cfg: dict, checkpoint_path: str, init_seed: int,
                         arena_override: str | None = None):
    """Wraps _sim_loop: checks _reset_req each arena iteration."""
    rc         = cfg['robot']
    v_max      = rc['v_max']
    wheel_base = rc['wheel_base']
    robot_w    = rc['robot_width']
    robot_l    = rc['robot_length']
    cs         = cfg['terrain']['cell_size']
    BASE_DT    = 0.12
    REPLAN_N   = 15

    dig_steps  = rc.get('digging_steps',  38)
    dump_steps = rc.get('dumping_steps',  27)
    mix_ucf    = cfg['training'].get('arena_mix_ucf', 0.4)

    ckpt_dir      = os.path.dirname(os.path.abspath(checkpoint_path))
    current_ckpt  = None
    model         = None

    # Load initial checkpoint if one exists
    initial = _find_latest_ckpt(ckpt_dir)
    if initial:
        model        = _load_model(cfg, initial)
        current_ckpt = initial
        epoch_label  = os.path.basename(initial).replace('epoch_', 'ep').replace('.pt', '')
        with _sim_lock:
            _sim_state['model_epoch'] = epoch_label

    scene_id = 0
    seed     = init_seed

    while True:
        _reset_req[0] = False

        # Hot-reload: pick up the newest epoch checkpoint written by trainer
        latest = _find_latest_ckpt(ckpt_dir)
        if latest and latest != current_ckpt:
            new_model = _load_model(cfg, latest)
            if new_model is not None:
                model        = new_model
                current_ckpt = latest
                epoch_label  = os.path.basename(latest).replace('epoch_', 'ep').replace('.pt', '')
                print(f'[visualize] reloaded → {epoch_label}')
                with _sim_lock:
                    _sim_state['model_epoch'] = epoch_label

        scene_id += 1
        rng    = random.Random(seed)
        np_rng = np.random.default_rng(seed)
        seed  += 1

        if arena_override:
            atype = arena_override
        else:
            atype = 'ucf' if rng.random() < mix_ucf else 'ksc'
        atype_val = 0.0 if atype == 'ucf' else 1.0

        arena   = generate_arena(cfg, rng, arena_type=atype)
        if model is not None:
            model._hidden = None
        terrain = build_terrain_maps(arena, cfg, np_rng)
        cost_full = _build_full_cost_map(terrain, cfg)

        def _rect(r):
            return {'x': r.x, 'y': r.y, 'w': r.w, 'h': r.h}

        with _sim_lock:
            _sim_scene.clear()
            _sim_scene.update({
                'scene_id':    scene_id,
                'arena_w':     arena.width,
                'arena_l':     arena.length,
                'arena_scale': arena.scale,
                'arena_type':  atype,
                't_rows':      terrain['rows'],
                't_cols':      terrain['cols'],
                'cell_size':   cs,
                'terrain_h':   terrain['height'].tolist(),
                'terrain_r':   terrain['rocks'].tolist(),
                'terrain_c':   terrain['craters'].tolist(),
                'terrain_w':   terrain['walls'].tolist(),
                'obstacles':   [{'x': o.x, 'y': o.y, 'd': o.diameter, 'k': o.kind}
                                for o in arena.obstacles],
                'zones': {
                    'start':      _rect(arena.start_zone),
                    'excavation': _rect(arena.excavation_zone),
                    'nav':        _rect(arena.nav_zone),
                    'deposit':    _rect(arena.deposit_zone),
                    'berm':       _rect(arena.berm_target),
                },
            })

        phase_idx = 0
        phase     = _PHASE_SEQ[phase_idx]

        goal_zone = _goal_zone_for_phase(arena, phase)

        # Always spawn in the start zone at the beginning of a new arena
        _margin = 0.4
        _clear  = 0.55
        sz = arena.start_zone
        rx, ry = sz.centre()
        heading = rng.uniform(-math.pi, math.pi)
        for _ in range(80):
            _x = rng.uniform(sz.x + _margin, sz.x + sz.w - _margin)
            _y = rng.uniform(sz.y + _margin, sz.y + sz.h - _margin)
            if (sz.w > 2 * _margin and sz.h > 2 * _margin and
                    all(math.hypot(_x - o.x, _y - o.y) > o.diameter / 2 + _clear
                        for o in arena.obstacles)):
                rx, ry = _x, _y
                heading = rng.uniform(-math.pi, math.pi)
                break

        gx, gy    = goal_zone.centre()
        goal_rc   = _world_to_cell(gx, gy, cs)
        path_full = astar(cost_full, _world_to_cell(rx, ry, cs), goal_rc) or []

        step          = 0
        phase_step    = 0
        prev_rx, prev_ry = rx, ry
        stuck_steps   = 0
        collided      = False

        while True:
            if _reset_req[0]:
                break

            t0 = time.monotonic()
            ts = max(_timescale[0], 0.05)
            DT = BASE_DT

            terrain_crop  = crop_robot_view(terrain, rx, ry, cfg)
            goal_map      = build_goal_heatmap(arena, goal_zone, rx, ry, cfg)
            expert_action = plan_action(terrain_crop, goal_map, heading, cfg, phase=phase)
            model_action  = (_infer(model, terrain_crop, goal_map, heading, phase, atype_val,
                                    rx, ry, arena)
                             if model else None)

            raw_action = model_action if model_action is not None else expert_action
            if raw_action is None:
                raw_action = (0.0, 0.0, 0)

            left, right, bucket = raw_action

            v_left  = left  * v_max
            v_right = right * v_max
            v       = (v_left + v_right) / 2.0
            omega   = (v_right - v_left) / wheel_base
            new_rx  = rx + v * math.cos(heading) * DT
            new_ry  = ry + v * math.sin(heading) * DT
            new_hdg = (heading + omega * DT + math.pi) % (2 * math.pi) - math.pi

            if (_check_collision(new_rx, new_ry, new_hdg,
                                 robot_w, robot_l, arena.obstacles) or
                    _check_boundary(new_rx, new_ry, new_hdg,
                                    robot_w, robot_l, arena.width, arena.length)):
                collided = True
            else:
                rx, ry, heading = new_rx, new_ry, new_hdg

            if step % REPLAN_N == 0 and phase not in ('digging', 'dumping'):
                path_full = astar(cost_full, _world_to_cell(rx, ry, cs), goal_rc) or []

            with _sim_lock:
                _sim_state.update({
                    'scene_id':    scene_id,
                    'rx':          rx,
                    'ry':          ry,
                    'heading':     heading,
                    'left':        left,
                    'right':       right,
                    'bucket':      bucket,
                    'phase':       phase,
                    'phase_step':  phase_step,
                    'expert':      list(expert_action) if expert_action else None,
                    'model':       list(model_action)  if model_action  else None,
                    'using_model': model_action is not None,
                    'path_world':  [[r * cs, c * cs] for r, c in path_full],
                    'step':        step,
                    'v':           v,
                    'omega':       omega,
                    'goal_x':      gx,
                    'goal_y':      gy,
                    'collided':    collided,
                    'timescale':   ts,
                    'crop_h':      terrain_crop[0].tolist(),
                    'crop_r':      terrain_crop[1].tolist(),
                    'crop_c':      terrain_crop[2].tolist(),
                    'crop_w':      terrain_crop[3].tolist(),
                    'goal_map':    goal_map.tolist(),
                })

            if collided:
                time.sleep(0.8)
                break

            step      += 1
            phase_step += 1

            # Phase transitions
            advance_phase = False
            if phase == 'to_excavation' and arena.excavation_zone.contains(rx, ry):
                advance_phase = True
            elif phase == 'digging' and phase_step >= dig_steps:
                advance_phase = True
            elif phase == 'to_deposit' and arena.deposit_zone.contains(rx, ry):
                advance_phase = True
            elif phase == 'dumping' and phase_step >= dump_steps:
                advance_phase = True

            if advance_phase:
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

            wall_time = DT / ts
            time.sleep(max(0.0, wall_time - (time.monotonic() - t0)))


def main():
    parser = argparse.ArgumentParser()
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    parser.add_argument('--config',     default=os.path.join(_script_dir, 'config.yaml'))
    parser.add_argument('--checkpoint', default=os.path.join(_script_dir, 'checkpoints', 'best.pt'))
    parser.add_argument('--seed',       type=int, default=0)
    parser.add_argument('--port',       type=int, default=8766)
    parser.add_argument('--arena',      choices=['ksc', 'ucf', 'random'], default='random',
                        help='Arena layout to simulate (random mixes both per training config)')
    args = parser.parse_args()
    cfg  = _load_cfg(args.config)

    arena_override = None if args.arena == 'random' else args.arena

    sim_thread = threading.Thread(
        target=_sim_loop_guarded,
        args=(cfg, args.checkpoint, args.seed, arena_override),
        daemon=True,
    )
    sim_thread.start()
    _serve(cfg, args)


if __name__ == '__main__':
    main()
