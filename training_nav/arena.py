"""Arena generator for Lunabotics navigation training.

Supports two arena layouts:

KSC Artemis 2026 (arena_type='ksc'):
  ┌──────────────┬──────────────────────────────┐  ← y = length (~5 m)
  │              │                              │
  │  Excavation  │     Obstacle / Nav Zone      │
  │     Zone     │     (rocks, craters,         │
  │   (left col) │      column obstacle)        │
  │              │                              │
  │  ┌─ Start ─┐ ├──────────────────────────────┤  ← y = dep_h (~1.5 m)
  │  │  Zone   │ │    Construction / Deposit    │
  │  │ (no obs)│ │    Zone  (berm target)       │
  └──┴─────────┴─┴──────────────────────────────┘
  x=0         exc_w                           width

UCF Practice Arena 2026 (arena_type='ucf'):
  ┌─────────────────────┬──────────────┬───────┐  ← y = length (~4.57 m)
  │                     │              │ Start │
  │  Excavation Zone    │  Nav/Obs     │ Zone  │
  │  (upper-left)       │  Zone        │ (top- │
  │                     │              │ right)│
  ├─────────────────────┴──────────────┴───────┤  ← y = const_h (~2.0 m)
  │  Construction Zone  │                      │
  │  (berm target)      │   (open / navigable) │
  └─────────────────────┴──────────────────────┘
  x=0                 const_w                width
"""

import math
import random
from dataclasses import dataclass, field
from typing import Tuple

import numpy as np
from scipy.ndimage import gaussian_filter


@dataclass
class Rect:
    x: float
    y: float
    w: float
    h: float

    def contains(self, px: float, py: float) -> bool:
        return self.x <= px < self.x + self.w and self.y <= py < self.y + self.h

    def centre(self) -> Tuple[float, float]:
        return self.x + self.w / 2, self.y + self.h / 2

    def random_point(self, rng: random.Random, margin: float = 0.0) -> Tuple[float, float]:
        x = rng.uniform(self.x + margin, self.x + self.w - margin)
        y = rng.uniform(self.y + margin, self.y + self.h - margin)
        return x, y


@dataclass
class Obstacle:
    x: float
    y: float
    diameter: float
    kind: str        # 'rock' | 'crater' | 'column'


@dataclass
class ArenaConfig:
    width: float
    length: float
    scale: float
    arena_type: str          # 'ksc' | 'ucf'
    start_zone: Rect
    excavation_zone: Rect
    nav_zone: Rect
    deposit_zone: Rect
    berm_target: Rect
    obstacles: list = field(default_factory=list)


def generate_arena(cfg: dict, rng: random.Random | None = None,
                   arena_type: str = 'ksc') -> ArenaConfig:
    """Build one randomised arena from config for the given arena_type."""
    if rng is None:
        rng = random.Random()

    ac     = cfg['arenas'][arena_type]
    tc     = cfg['training']
    scale  = rng.uniform(tc['scale_min'], tc['scale_max'])
    width  = ac['base_width']  * scale
    length = ac['base_length'] * scale
    spread = ac.get('obstacle_spread', 1.4)

    n_rocks   = max(0, round(ac['rocks_mean']   * rng.uniform(0.7, 1.3)))
    n_craters = max(0, round(ac['craters_mean'] * rng.uniform(0.7, 1.3)))

    if arena_type == 'ucf':
        # UCF: construction bottom-left, excavation upper-left, start top-right
        const_w = width  * ac['construction_w_frac']
        const_h = length * ac['construction_h_frac']
        exc_w   = width  * ac['excavation_w_frac']
        st_w    = width  * ac['start_w_frac']
        st_h    = length * ac['start_h_frac']

        start_zone      = Rect(width - st_w, length - st_h, st_w, st_h)
        excavation_zone = Rect(0, const_h, exc_w, length - const_h)
        deposit_zone    = Rect(0, 0, const_w, const_h)
        nav_zone        = Rect(exc_w, const_h, width - exc_w, length - const_h)

        bw = min(ac['berm_w'], deposit_zone.w * 0.75)
        bh = min(ac['berm_h'], deposit_zone.h * 0.75)
        bx = deposit_zone.x + (deposit_zone.w - bw) / 2
        by = deposit_zone.y + (deposit_zone.h - bh) / 2
        berm_target = Rect(bx, by, bw, bh)

        obstacle_zones = [excavation_zone, nav_zone]

    else:  # ksc
        exc_w   = width  * ac['excavation_width_frac']
        nav_w   = width  - exc_w
        start_h = length * ac['start_length_frac']
        dep_h   = length * ac['deposit_length_frac']

        start_zone      = Rect(0, 0, exc_w, start_h)
        excavation_zone = Rect(0, 0, exc_w, length)
        deposit_zone    = Rect(exc_w, 0, nav_w, dep_h)
        nav_zone        = Rect(exc_w, dep_h, nav_w, length - dep_h)

        bw = min(ac['berm_w'], deposit_zone.w * 0.75)
        bh = min(ac['berm_h'], deposit_zone.h * 0.75)
        bx = deposit_zone.x + (deposit_zone.w - bw) / 2
        by = deposit_zone.y + (deposit_zone.h - bh) / 2
        berm_target = Rect(bx, by, bw, bh)

        exc_upper      = Rect(0, start_h, exc_w, length - start_h)
        obstacle_zones = [exc_upper, nav_zone]

    # ── Obstacle placement + clear-path check (retry up to 8×) ────────────────
    last_arena = None
    col_sz = ac.get('column_size', 0.0)
    for _attempt in range(8):
        obstacles: list[Obstacle] = []

        # Column placed first so rocks/craters check against it
        if col_sz > 0:
            col_x = width  / 2 + rng.uniform(-width  * 0.04, width  * 0.04)
            col_y = length / 2 + rng.uniform(-length * 0.04, length * 0.04)
            obstacles.append(Obstacle(col_x, col_y, col_sz * math.sqrt(2), 'column'))

        for kind, n, diam in [('rock',   n_rocks,   ac['rock_diameter']),
                               ('crater', n_craters, ac['crater_diameter'])]:
            placed, attempts = 0, 0
            while placed < n and attempts < n * 40:
                attempts += 1
                zone   = rng.choice(obstacle_zones)
                margin = diam
                if zone.w <= 2 * margin or zone.h <= 2 * margin:
                    continue
                ox = rng.uniform(zone.x + margin, zone.x + zone.w - margin)
                oy = rng.uniform(zone.y + margin, zone.y + zone.h - margin)
                if start_zone.contains(ox, oy) or deposit_zone.contains(ox, oy):
                    continue
                # Tight physical buffer for column; spread-based spacing for rocks/craters
                too_close = any(
                    math.hypot(ox - o.x, oy - o.y) < (diam / 2 + o.diameter / 2) * 1.3
                    for o in obstacles if o.kind == 'column'
                ) or any(
                    math.hypot(ox - o.x, oy - o.y) < (diam + o.diameter) * spread
                    for o in obstacles if o.kind != 'column'
                )
                if not too_close:
                    obstacles.append(Obstacle(ox, oy, diam, kind))
                    placed += 1

        candidate = ArenaConfig(
            width=width, length=length, scale=scale, arena_type=arena_type,
            start_zone=start_zone, excavation_zone=excavation_zone,
            nav_zone=nav_zone, deposit_zone=deposit_zone,
            berm_target=berm_target, obstacles=obstacles,
        )
        last_arena = candidate
        if _has_clear_corridors(candidate):
            return candidate

    return last_arena


def _has_clear_corridors(arena: ArenaConfig, robot_clearance: float = 0.45) -> bool:
    """BFS check that start→excavation and excavation→deposit corridors are navigable."""
    cs   = 0.15
    cols = max(1, int(arena.width  / cs) + 2)
    rows = max(1, int(arena.length / cs) + 2)

    blocked = [[False] * cols for _ in range(rows)]
    for obs in arena.obstacles:
        r  = obs.diameter / 2 + robot_clearance
        cx = int(obs.x / cs)
        cy = int(obs.y / cs)
        rc = int(r / cs) + 1
        for dr in range(-rc, rc + 1):
            for dc in range(-rc, rc + 1):
                if dr * dr + dc * dc <= rc * rc:
                    nr, nc = cy + dr, cx + dc
                    if 0 <= nr < rows and 0 <= nc < cols:
                        blocked[nr][nc] = True

    def can_reach(from_z: Rect, to_z: Rect) -> bool:
        r0 = max(0, int(from_z.y / cs))
        r1 = min(rows, int((from_z.y + from_z.h) / cs) + 1)
        c0 = max(0, int(from_z.x / cs))
        c1 = min(cols, int((from_z.x + from_z.w) / cs) + 1)
        q = [(r, c) for r in range(r0, r1) for c in range(c0, c1)
             if not blocked[r][c]]
        if not q:
            return False
        visited = set(q)
        while q:
            nq = []
            for r, c in q:
                if to_z.contains(c * cs, r * cs):
                    return True
                for dr, dc in ((-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)):
                    nr, nc = r + dr, c + dc
                    if (0 <= nr < rows and 0 <= nc < cols
                            and (nr, nc) not in visited
                            and not blocked[nr][nc]):
                        visited.add((nr, nc))
                        nq.append((nr, nc))
            q = nq
        return False

    return (can_reach(arena.start_zone, arena.excavation_zone) and
            can_reach(arena.excavation_zone, arena.deposit_zone))


# ── Terrain map generation ────────────────────────────────────────────────────

def build_terrain_maps(arena: ArenaConfig, cfg: dict,
                       rng: np.random.Generator | None = None) -> dict:
    """
    Returns terrain maps for the FULL arena (not robot-centred).
    Each map is (arena_rows, arena_cols) float32.
    Keys: 'height', 'rocks', 'craters', 'walls'
    """
    if rng is None:
        rng = np.random.default_rng()

    tc = cfg['terrain']
    cs = tc.get('cell_size', 0.1)

    cols = max(1, round(arena.width  / cs))
    rows = max(1, round(arena.length / cs))

    def to_cell(x, y):
        return int(x / cs), int(y / cs)   # col, row

    # ── Height map ─────────────────────────────────────────────────────────────
    height = rng.standard_normal((rows, cols)).astype(np.float32) * tc['height_noise_std']
    height = gaussian_filter(height, sigma=3.0)
    slope  = np.linspace(0, 0.08 * arena.scale, rows)[:, None]
    height += slope
    for zone in [arena.start_zone, arena.deposit_zone]:
        c0, r0 = to_cell(zone.x, zone.y)
        c1, r1 = to_cell(zone.x + zone.w, zone.y + zone.h)
        height[r0:r1, c0:c1] *= 0.1

    # ── Rock heatmap ────────────────────────────────────────────────────────────
    rocks = np.zeros((rows, cols), dtype=np.float32)
    for obs in arena.obstacles:
        if obs.kind != 'rock':
            continue
        cx, cy = int(obs.x / cs), int(obs.y / cs)
        sigma  = max(1.0, (obs.diameter / 2) / cs)
        r      = int(sigma * 3)
        x0, x1 = max(0, cx - r), min(cols, cx + r + 1)
        y0, y1 = max(0, cy - r), min(rows, cy + r + 1)
        xs = np.arange(x0, x1) - cx;  ys = np.arange(y0, y1) - cy
        xx, yy = np.meshgrid(xs, ys)
        rocks[y0:y1, x0:x1] = np.maximum(
            rocks[y0:y1, x0:x1],
            np.exp(-(xx**2 + yy**2) / (2 * sigma**2))
        )
        height[y0:y1, x0:x1] += rocks[y0:y1, x0:x1] * 0.25 * arena.scale

    # ── Crater heatmap ──────────────────────────────────────────────────────────
    craters = np.zeros((rows, cols), dtype=np.float32)
    for obs in arena.obstacles:
        if obs.kind != 'crater':
            continue
        cx, cy = int(obs.x / cs), int(obs.y / cs)
        sigma  = max(1.0, (obs.diameter / 2) / cs)
        r      = int(sigma * 3)
        x0, x1 = max(0, cx - r), min(cols, cx + r + 1)
        y0, y1 = max(0, cy - r), min(rows, cy + r + 1)
        xs = np.arange(x0, x1) - cx;  ys = np.arange(y0, y1) - cy
        xx, yy = np.meshgrid(xs, ys)
        blob = np.exp(-(xx**2 + yy**2) / (2 * sigma**2))
        craters[y0:y1, x0:x1] = np.maximum(craters[y0:y1, x0:x1], blob)
        height[y0:y1, x0:x1] -= blob * 0.3 * arena.scale

    # ── Column obstacle as hard wall ────────────────────────────────────────────
    walls = np.zeros((rows, cols), dtype=np.float32)
    wall_thick = max(1, int(0.1 / cs))
    walls[:wall_thick,  :] = 1.0
    walls[-wall_thick:, :] = 1.0
    walls[:,  :wall_thick] = 1.0
    walls[:, -wall_thick:] = 1.0

    for obs in arena.obstacles:
        if obs.kind != 'column':
            continue
        half = (obs.diameter / (math.sqrt(2) * 2)) / cs
        cx, cy = int(obs.x / cs), int(obs.y / cs)
        ih = max(1, int(half))
        x0, x1 = max(0, cx - ih), min(cols, cx + ih + 1)
        y0, y1 = max(0, cy - ih), min(rows, cy + ih + 1)
        walls[y0:y1, x0:x1]  = 1.0
        height[y0:y1, x0:x1] = 1.0

    height = (height / tc['height_scale']).astype(np.float32)

    return {'height': height, 'rocks': rocks, 'craters': craters, 'walls': walls,
            'rows': rows, 'cols': cols}


def _view_cell_size(cfg: dict) -> tuple[float, float]:
    tc = cfg['terrain']
    gs = tc['grid_size']
    return tc['view_width'] / gs, tc['view_height'] / gs


def crop_robot_view(terrain: dict, robot_x: float, robot_y: float,
                    cfg: dict) -> np.ndarray:
    """
    Resample the full arena terrain into a grid_size × grid_size patch centred
    on the robot.  Returns (4, grid_size, grid_size) float32.
    """
    tc       = cfg['terrain']
    gs       = tc['grid_size']
    csx, csy = _view_cell_size(cfg)
    arena_cs = tc.get('cell_size', 0.1)
    rows     = terrain['rows']
    cols     = terrain['cols']
    half     = gs // 2

    pj = np.arange(gs);  pi = np.arange(gs)
    wx = robot_x + (pj - half) * csx
    wy = robot_y + (pi - half) * csy

    ci = (wx / arena_cs).astype(np.intp)
    ri = (wy / arena_cs).astype(np.intp)

    col_valid = (ci >= 0) & (ci < cols)
    row_valid = (ri >= 0) & (ri < rows)
    valid     = row_valid[:, None] & col_valid[None, :]

    ci_safe = np.clip(ci, 0, cols - 1)
    ri_safe = np.clip(ri, 0, rows - 1)

    channels = []
    for key in ('height', 'rocks', 'craters', 'walls'):
        patch = terrain[key][np.ix_(ri_safe, ci_safe)]
        # Out-of-bounds fill = 0.0 for all channels, matching the terrain model's
        # behaviour (no sensor return outside the arena → no signal).
        # Arena boundary walls are explicitly drawn as 1.0 inside the arena grid,
        # so the robot still sees the wall before it exits — the fill only affects
        # the area beyond the physical boundary.
        channels.append(np.where(valid, patch, 0.0).astype(np.float32))

    return np.stack(channels, axis=0)   # (4, gs, gs)


def build_goal_heatmap(arena: ArenaConfig, goal_zone: Rect,
                       robot_x: float, robot_y: float, cfg: dict) -> np.ndarray:
    tc       = cfg['terrain']
    gs       = tc['grid_size']
    csx, csy = _view_cell_size(cfg)
    half     = gs // 2

    pj = np.arange(gs);  pi = np.arange(gs)
    wx = robot_x + (pj - half) * csx
    wy = robot_y + (pi - half) * csy

    in_x    = (wx >= goal_zone.x) & (wx < goal_zone.x + goal_zone.w)
    in_y    = (wy >= goal_zone.y) & (wy < goal_zone.y + goal_zone.h)
    heatmap = (in_y[:, None] & in_x[None, :]).astype(np.float32)

    heatmap = gaussian_filter(heatmap, sigma=3.0)
    if heatmap.max() > 0:
        heatmap /= heatmap.max()

    return heatmap


def current_zone(arena: ArenaConfig, x: float, y: float) -> str:
    if arena.berm_target.contains(x, y):
        return 'berm_target'
    if arena.deposit_zone.contains(x, y):
        return 'deposit'
    if arena.start_zone.contains(x, y):
        return 'start'
    if arena.excavation_zone.contains(x, y):
        return 'excavation'
    if arena.nav_zone.contains(x, y):
        return 'nav'
    return 'outside'
