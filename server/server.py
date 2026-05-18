"""OCTANE Navigation Policy — simulation server for Angular visualizer.

Runs the arena simulation in a background thread and exposes a REST API
that the Angular app polls at ~10 Hz.  CORS is enabled so the Angular dev
server (localhost:4200) can connect.

Usage:
  python server/server.py                             (A* expert, random arena)
  python server/server.py --checkpoint path/to/ep.pt  (trained model)
  python server/server.py --arena ksc                 (force KSC layout)
  python server/server.py --arena ucf                 (force UCF layout)
  python server/server.py --port 5000

Angular connects to: http://localhost:5000

API:
  GET /api/state    — current robot pose, motors, phase, sensor crops
  GET /api/scene    — static arena geometry (zones, obstacles, terrain)
  GET /api/reset    — force next arena immediately
  GET /api/timescale?v=N  — set simulation speed multiplier
"""

import argparse
import glob
import math
import os
import random
import subprocess
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse
import json

_REPO_ROOT    = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
_METRICS_PATH = os.path.join(_REPO_ROOT, 'training_nav', 'metrics.json')
_TRAIN_SCRIPT = os.path.join(_REPO_ROOT, 'training_nav', 'train.py')

_train_proc: list = [None]   # [subprocess.Popen | None]
_train_proc_lock = threading.Lock()


def _training_status() -> dict:
    with _train_proc_lock:
        proc    = _train_proc[0]
        running = proc is not None and proc.poll() is None
    status: dict = {'running': running}
    try:
        with open(_METRICS_PATH) as f:
            status.update(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    status['running'] = running  # proc state overrides stale file value
    return status


def _start_training() -> dict:
    with _train_proc_lock:
        proc = _train_proc[0]
        if proc is not None and proc.poll() is None:
            return {'ok': False, 'error': 'already running'}
        _train_proc[0] = subprocess.Popen(
            [sys.executable, _TRAIN_SCRIPT, '--headless'],
            cwd=os.path.abspath(_REPO_ROOT),
            stdin=subprocess.DEVNULL,
        )
    return {'ok': True}


def _stop_training() -> dict:
    with _train_proc_lock:
        proc = _train_proc[0]
        if proc is None or proc.poll() is not None:
            return {'ok': False, 'error': 'not running'}
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        _train_proc[0] = None
    return {'ok': True}

import numpy as np
import yaml

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from training_nav.arena import (
    build_goal_heatmap, build_terrain_maps, crop_robot_view, generate_arena,
)
from training_nav.arena import current_zone as _current_zone
from training_nav.dataset import _goal_zone_for_phase, _sample_robot_pose, _PHASE_IDX, _ZONE_IDX
from training_nav.planner import _build_cost_map, astar, plan_action


# ── Shared state ───────────────────────────────────────────────────────────────

_sim_state: dict = {}
_sim_scene: dict = {}
_sim_lock  = threading.Lock()
_timescale = [1.0]
_reset_req = [False]


# ── Model loading ──────────────────────────────────────────────────────────────

def _find_latest_ckpt(ckpt_dir: str):
    paths = sorted(glob.glob(os.path.join(ckpt_dir, 'epoch_*.pt')))
    return paths[-1] if paths else None


def _load_model(cfg: dict, checkpoint_path: str):
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
        print(f'[server] model loaded  {os.path.basename(checkpoint_path)}')
        return model
    except Exception as e:
        print(f'[server] no model ({e})')
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


# ── Simulation loop ────────────────────────────────────────────────────────────

_PHASE_SEQ = ['to_excavation', 'digging', 'to_deposit', 'dumping']


def _sim_loop_guarded(cfg, checkpoint_path, init_seed, arena_override):
    seed = init_seed
    while True:
        try:
            _sim_loop(cfg, checkpoint_path, seed, arena_override)
        except Exception:
            traceback.print_exc()
            time.sleep(1.0)
        seed += 1


def _sim_loop(cfg, checkpoint_path, init_seed, arena_override):
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

    ckpt_dir     = os.path.dirname(os.path.abspath(checkpoint_path))
    current_ckpt = None
    model        = None

    initial = _find_latest_ckpt(ckpt_dir)
    if initial:
        model        = _load_model(cfg, initial)
        current_ckpt = initial
        with _sim_lock:
            _sim_state['model_epoch'] = os.path.basename(initial).replace('epoch_', 'ep').replace('.pt', '')

    scene_id = 0
    seed     = init_seed

    while True:
        _reset_req[0] = False

        # Hot-reload latest checkpoint
        latest = _find_latest_ckpt(ckpt_dir)
        if latest and latest != current_ckpt:
            new_model = _load_model(cfg, latest)
            if new_model:
                model        = new_model
                current_ckpt = latest
                label        = os.path.basename(latest).replace('epoch_', 'ep').replace('.pt', '')
                print(f'[server] reloaded → {label}')
                with _sim_lock:
                    _sim_state['model_epoch'] = label

        scene_id += 1
        rng    = random.Random(seed)
        np_rng = np.random.default_rng(seed)
        seed  += 1

        atype     = arena_override or ('ucf' if rng.random() < mix_ucf else 'ksc')
        atype_val = 0.0 if atype == 'ucf' else 1.0

        arena   = generate_arena(cfg, rng, arena_type=atype)
        if model: model._hidden = None  # type: ignore[attr-defined]
        terrain   = build_terrain_maps(arena, cfg, np_rng)
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
                    'deposit':    _rect(arena.deposit_zone),
                    'berm':       _rect(arena.berm_target),
                },
            })

        phase_idx = 0
        phase     = _PHASE_SEQ[phase_idx]
        goal_zone = _goal_zone_for_phase(arena, phase)

        margin = 0.4
        clear  = 0.55
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

        gx, gy     = goal_zone.centre()
        goal_rc    = _world_to_cell(gx, gy, cs)
        path_full  = astar(cost_full, _world_to_cell(rx, ry, cs), goal_rc) or []

        step = phase_step = 0
        prev_rx, prev_ry  = rx, ry
        stuck_steps = 0
        collided = False

        while True:
            if _reset_req[0]:
                break

            t0 = time.monotonic()
            ts = max(_timescale[0], 0.05)
            DT = BASE_DT

            crop      = crop_robot_view(terrain, rx, ry, cfg)
            goal_map  = build_goal_heatmap(arena, goal_zone, rx, ry, cfg)
            expert    = plan_action(crop, goal_map, heading, cfg, phase=phase)
            model_act = (_infer(model, crop, goal_map, heading, phase, atype_val, rx, ry, arena)
                         if model else None)

            raw = model_act if model_act is not None else expert
            if raw is None:
                raw = (0.0, 0.0, 0)
            left, right, bucket = raw

            v_left  = left  * v_max
            v_right = right * v_max
            v       = (v_left + v_right) / 2.0
            omega   = (v_right - v_left) / wb
            new_rx  = rx + v * math.cos(heading) * DT
            new_ry  = ry + v * math.sin(heading) * DT
            new_hdg = (heading + omega * DT + math.pi) % (2 * math.pi) - math.pi

            if (_check_collision(new_rx, new_ry, new_hdg, robot_w, robot_l, arena.obstacles) or
                    _check_boundary(new_rx, new_ry, new_hdg, robot_w, robot_l, arena.width, arena.length)):
                collided = True
            else:
                rx, ry, heading = new_rx, new_ry, new_hdg

            if step % REPLAN_N == 0 and phase not in ('digging', 'dumping'):
                path_full = astar(cost_full, _world_to_cell(rx, ry, cs), goal_rc) or []

            with _sim_lock:
                _sim_state.update({
                    'scene_id':    scene_id,
                    'rx': rx,  'ry': ry,  'heading': heading,
                    'left': left,  'right': right,  'bucket': bucket,
                    'phase': phase,  'phase_step': phase_step,
                    'expert':      list(expert)     if expert     else None,
                    'model':       list(model_act)  if model_act  else None,
                    'using_model': model_act is not None,
                    'path_world':  [[r * cs, c * cs] for r, c in path_full],
                    'step': step,  'v': v,  'omega': omega,
                    'goal_x': gx,  'goal_y': gy,
                    'collided': collided,
                    'timescale': ts,
                    'crop_h': crop[0].tolist(),  'crop_r': crop[1].tolist(),
                    'crop_c': crop[2].tolist(),  'crop_w': crop[3].tolist(),
                    'goal_map': goal_map.tolist(),
                    'model_epoch': _sim_state.get('model_epoch', ''),
                })

            if collided:
                time.sleep(0.8)
                break

            step += 1; phase_step += 1

            # Phase transitions
            if phase == 'to_excavation' and arena.excavation_zone.contains(rx, ry):
                advance = True
            elif phase == 'digging' and phase_step >= dig_steps:
                advance = True
            elif phase == 'to_deposit' and arena.deposit_zone.contains(rx, ry):
                advance = True
            elif phase == 'dumping' and phase_step >= dump_steps:
                advance = True
            else:
                advance = False

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

            time.sleep(max(0.0, DT / ts - (time.monotonic() - t0)))


# ── HTTP server ────────────────────────────────────────────────────────────────

class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass

    def do_GET(self):
        parsed = urlparse(self.path)
        qs     = parse_qs(parsed.query)
        path   = parsed.path

        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')

        if path == '/api/state':
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
        elif path == '/api/training/status':
            self._json(_training_status())
        else:
            self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path   = parsed.path
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        if path == '/api/training/start':
            self._json(_start_training())
        elif path == '/api/training/stop':
            self._json(_stop_training())
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _json(self, obj):
        enc = json.dumps(obj).encode()
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', len(enc))
        self.end_headers()
        self.wfile.write(enc)


def main():
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    _ckpt_dir   = os.path.join(_script_dir, '..', 'training_nav', 'checkpoints')

    parser = argparse.ArgumentParser()
    parser.add_argument('--config',     default=os.path.join(_script_dir, '..', 'training_nav', 'config.yaml'))
    parser.add_argument('--checkpoint', default=os.path.join(_ckpt_dir, 'best.pt'))
    parser.add_argument('--seed',       type=int, default=0)
    parser.add_argument('--port',       type=int, default=5000)
    parser.add_argument('--arena',      choices=['ksc', 'ucf', 'random'], default='random')
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    arena_override = None if args.arena == 'random' else args.arena

    sim_thread = threading.Thread(
        target=_sim_loop_guarded,
        args=(cfg, args.checkpoint, args.seed, arena_override),
        daemon=True,
    )
    sim_thread.start()

    server = HTTPServer(('localhost', args.port), _Handler)
    print(f'[server]  http://localhost:{args.port}  (Ctrl+C to stop)')
    print(f'[server]  Angular dev server: http://localhost:4200')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
