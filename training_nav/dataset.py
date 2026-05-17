"""Navigation dataset — generates samples on the fly from random arenas.

Each sample is a sequence of T timesteps (T = cfg['model']['seq_len'], default 16):
  terrain:    (T, 5, gs, gs) float32 — height, rocks, craters, walls, goal_heatmap
  heading:    (T, 2)         float32 — [sin(yaw), cos(yaw)]
  zone_idx:   (T,)           long    — per-timestep zone
  arena_type: ()             float32 — 0.0=UCF, 1.0=KSC
  phase_idx:  ()             long    — mission phase (constant per episode)
  action:     (T, 3)         float32 — [left_motor, right_motor, bucket_class]
                             motors normalised to [-1, 1] by nav_speed_limit

DART: 25% of episodes perturb the robot start position so the model sees
off-path recovery states.  Probability and std are fixed in training config.

No curriculum stages — all obstacle configurations from epoch 1.
"""

import math
import random

import numpy as np
import torch
from torch.utils.data import Dataset

from training_nav.arena import (
    ArenaConfig, Rect, build_goal_heatmap, build_terrain_maps,
    crop_robot_view, current_zone, generate_arena,
)
from training_nav.planner import plan_action


_PHASES = ['to_excavation', 'digging', 'to_deposit', 'dumping']

_BUCKET_FOR_PHASE = {'to_excavation': 0, 'digging': 1, 'to_deposit': 0, 'dumping': 2}
_PHASE_IDX        = {'to_excavation': 0, 'digging': 1, 'to_deposit': 2, 'dumping': 3}
_ZONE_IDX         = {'start': 0, 'excavation': 1, 'nav': 2,
                     'deposit': 3, 'berm_target': 4, 'outside': 5}


def _angle_diff(a: float, b: float) -> float:
    d = a - b
    while d >  math.pi: d -= 2 * math.pi
    while d < -math.pi: d += 2 * math.pi
    return d


def _nearest_obstacle(rx: float, ry: float, arena) -> tuple:
    min_dist = float('inf')
    nearest  = None
    is_wall  = False
    for obs in arena.obstacles:
        d = math.hypot(rx - obs.x, ry - obs.y) - obs.diameter / 2
        if d < min_dist:
            min_dist = d; nearest = obs; is_wall = False
    for dist_to_wall, tag in [
        (rx, 'x_min'), (arena.width - rx, 'x_max'),
        (ry, 'y_min'), (arena.length - ry, 'y_max'),
    ]:
        if dist_to_wall < min_dist:
            min_dist = dist_to_wall; nearest = tag; is_wall = True
    return min_dist, nearest, is_wall


def _recovery_action(rx, ry, heading, nearest, is_wall, nav_limit, phase):
    bucket = _BUCKET_FOR_PHASE.get(phase, 0)
    wall_escapes = {'x_min': 0.0, 'x_max': math.pi,
                    'y_min': math.pi / 2, 'y_max': -math.pi / 2}
    if is_wall:
        escape = wall_escapes.get(nearest, 0.0)
    elif nearest is not None:
        escape = math.atan2(ry - nearest.y, rx - nearest.x)
    else:
        escape = heading + math.pi
    escape   = ((escape + math.pi) % (2 * math.pi)) - math.pi
    ang_err  = _angle_diff(escape, heading)
    ang_norm = float(np.clip(ang_err / math.pi, -1.0, 1.0))
    mix  = ang_norm * nav_limit
    base = float(np.clip(nav_limit * (1.0 - abs(ang_norm)), -nav_limit * 0.5, nav_limit))
    return float(np.clip(base - mix, -nav_limit, nav_limit)), \
           float(np.clip(base + mix, -nav_limit, nav_limit)), bucket


def _goal_zone_for_phase(arena: ArenaConfig, phase: str) -> Rect:
    if phase in ('to_excavation', 'digging'):
        return arena.excavation_zone
    return arena.berm_target


def _start_zones_for_phase(arena: ArenaConfig, phase: str) -> list:
    if phase == 'to_excavation':
        return [arena.start_zone, arena.nav_zone]
    elif phase == 'digging':
        ez = arena.excavation_zone
        return [Rect(ez.x, ez.y + ez.h * 0.1, ez.w, ez.h * 0.9)]
    elif phase == 'to_deposit':
        return [arena.excavation_zone, arena.nav_zone]
    elif phase == 'dumping':
        return [arena.deposit_zone]
    return [arena.start_zone]


def _sample_robot_pose(arena, phase, rng, margin=0.65):
    clearance = 0.35
    candidates = _start_zones_for_phase(arena, phase)
    for _ in range(200):
        zone = rng.choice(candidates)
        if zone.w <= 2 * margin or zone.h <= 2 * margin:
            continue
        x = rng.uniform(zone.x + margin, zone.x + zone.w - margin)
        y = rng.uniform(zone.y + margin, zone.y + zone.h - margin)
        wall_ok = (x >= margin and x <= arena.width  - margin and
                   y >= margin and y <= arena.length - margin)
        obs_ok  = all(math.hypot(x - o.x, y - o.y) > o.diameter / 2 + clearance
                      for o in arena.obstacles)
        if wall_ok and obs_ok:
            return x, y, rng.uniform(-math.pi, math.pi)
    z = candidates[0]
    cx = float(np.clip(z.x + z.w / 2, margin, arena.width  - margin))
    cy = float(np.clip(z.y + z.h / 2, margin, arena.length - margin))
    return cx, cy, 0.0


class NavDataset(Dataset):
    """Generates navigation samples on the fly.

    reshuffle(epoch) must be called each epoch before iterating.
    """

    def __init__(self, cfg: dict, n_samples: int, seed: int = 0):
        self.cfg      = cfg
        self.n        = n_samples
        self.epoch    = 0
        base_rng      = random.Random(seed)
        self._seeds   = [base_rng.randint(0, 2**31) for _ in range(n_samples)]

    def __len__(self):
        return self.n

    def __getitem__(self, idx: int):
        seed   = self._seeds[idx]
        rng    = random.Random(seed)
        np_rng = np.random.default_rng(seed)

        mix       = self.cfg['training'].get('arena_mix_ucf', 0.5)
        atype     = 'ucf' if rng.random() < mix else 'ksc'
        atype_val = np.float32(0.0 if atype == 'ucf' else 1.0)

        arena   = generate_arena(self.cfg, rng, arena_type=atype)
        terrain = build_terrain_maps(arena, self.cfg, np_rng)

        phase     = rng.choice(_PHASES)
        goal_zone = _goal_zone_for_phase(arena, phase)
        danger    = float(self.cfg['robot'].get('danger_distance', 0.55))
        rx, ry, heading = _sample_robot_pose(arena, phase, rng, margin=danger + 0.1)

        # DART: perturb start position so model sees recovery states
        dart_prob = self.cfg['training'].get('dart_prob', 0.25)
        dart_std  = self.cfg['training'].get('dart_std',  0.25)
        if rng.random() < dart_prob:
            for _ in range(50):
                rx_p = float(np.clip(rx + rng.gauss(0, dart_std), 0.4, arena.width  - 0.4))
                ry_p = float(np.clip(ry + rng.gauss(0, dart_std), 0.4, arena.length - 0.4))
                if all(math.hypot(rx_p - o.x, ry_p - o.y) > o.diameter / 2 + 0.35
                       for o in arena.obstacles):
                    rx, ry = rx_p, ry_p
                    break

        seq_len   = self.cfg['model'].get('seq_len', 16)
        nav_limit = self.cfg['robot'].get('nav_speed_limit', 1.0)
        sim_dt    = self.cfg['training'].get('sim_dt', 0.10)
        wb        = self.cfg['robot']['wheel_base']
        robot_hw  = float(self.cfg['robot'].get('robot_half_width', 0.375))
        danger    = float(self.cfg['robot'].get('danger_distance',  0.55))
        rec_min   = int(self.cfg['robot'].get('recovery_steps',     8))
        rec_cd    = 0
        phase_idx = _PHASE_IDX.get(phase, 0)

        terrain_list, heading_list, zone_list, action_list = [], [], [], []

        for _ in range(seq_len):
            heading_list.append(np.array([math.sin(heading), math.cos(heading)], dtype=np.float32))
            zone_list.append(_ZONE_IDX.get(current_zone(arena, rx, ry), 5))

            crop     = crop_robot_view(terrain, rx, ry, self.cfg)
            goal_map = build_goal_heatmap(arena, goal_zone, rx, ry, self.cfg)
            terrain_list.append(np.concatenate([crop, goal_map[None]], axis=0).astype(np.float32))

            near_dist, near_obs, near_wall = _nearest_obstacle(rx, ry, arena)
            if near_dist < robot_hw:
                rec_cd = rec_min
            if rec_cd > 0 or near_dist < danger:
                left, right, bucket = _recovery_action(rx, ry, heading, near_obs, near_wall,
                                                       nav_limit, phase)
                rec_cd = max(0, rec_cd - 1)
            else:
                action = plan_action(crop, goal_map, heading, self.cfg, phase=phase)
                left, right, bucket = action if action else (0.0, 0.0, _BUCKET_FOR_PHASE.get(phase, 0))

            action_list.append(np.array([left / nav_limit, right / nav_limit, float(bucket)],
                                         dtype=np.float32))

            v = (left + right) / 2.0
            rx  = float(np.clip(rx  + v * math.cos(heading) * sim_dt, 0.2, arena.width  - 0.2))
            ry  = float(np.clip(ry  + v * math.sin(heading) * sim_dt, 0.2, arena.length - 0.2))
            heading = ((heading + (right - left) / wb * sim_dt + math.pi) % (2 * math.pi)) - math.pi

        return (
            torch.from_numpy(np.stack(terrain_list)),   # (T, 5, gs, gs)
            torch.from_numpy(np.stack(heading_list)),   # (T, 2)
            torch.tensor(zone_list, dtype=torch.long),  # (T,)
            torch.tensor(atype_val),                    # scalar float
            torch.tensor(phase_idx, dtype=torch.long),  # scalar int
            torch.from_numpy(np.stack(action_list)),    # (T, 3)
        )

    def reshuffle(self, epoch: int):
        self.epoch = epoch
        base = random.Random(epoch)
        self._seeds = [base.randint(0, 2**31) for _ in range(self.n)]
