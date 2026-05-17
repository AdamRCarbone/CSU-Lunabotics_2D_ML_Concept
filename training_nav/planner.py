"""A* pathfinder on terrain cost maps.

Generates expert trajectories for navigation policy training.
Cost at each cell combines slope, crater, rock, and wall penalties.

Action extraction produces (left, right, bucket):
  left/right ∈ [0, 1]  — differential drive motor commands
  bucket ∈ {0, 1, 2}   — 0=UP(travel) 1=COLLECT(digging) 2=DUMP(at berm)
  |left - right| ≤ diff_limit (0.8) per hardware constraint.

During 'digging' and 'dumping' phases the planner returns fixed low-speed
or stopped commands with the appropriate bucket position rather than
navigating with A*.
"""

import heapq
import math

import numpy as np
from scipy.ndimage import sobel


_BUCKET_FOR_PHASE = {
    'to_excavation': 0,
    'digging':       1,
    'to_deposit':    0,
    'dumping':       2,
}


def _build_cost_map(terrain_maps: np.ndarray, cfg: dict) -> np.ndarray:
    """terrain_maps: (4, H, W) — height, rocks, craters, walls → (H, W) cost."""
    pc      = cfg['planner']
    height  = terrain_maps[0]
    rocks   = terrain_maps[1]
    craters = terrain_maps[2]
    walls   = terrain_maps[3]

    sx = sobel(height, axis=1);  sy = sobel(height, axis=0)
    slope = np.sqrt(sx**2 + sy**2)

    cost = (1.0
            + pc['slope_weight']  * slope
            + pc['rock_weight']   * rocks
            + pc['crater_weight'] * craters
            + pc['wall_weight']   * walls)
    return cost.astype(np.float32)


def astar(cost: np.ndarray, start: tuple, goal: tuple) -> list | None:
    rows, cols = cost.shape
    sr, sc = start;  gr, gc = goal

    if not (0 <= sr < rows and 0 <= sc < cols): return None
    if not (0 <= gr < rows and 0 <= gc < cols): return None

    def h(r, c): return math.hypot(r - gr, c - gc)

    open_set = [(h(sr, sc), 0.0, sr, sc)]
    came_from = {}
    g_score   = {(sr, sc): 0.0}

    while open_set:
        _, g, r, c = heapq.heappop(open_set)
        if (r, c) == (gr, gc):
            path = []
            node = (r, c)
            while node in came_from:
                path.append(node);  node = came_from[node]
            path.append((sr, sc))
            return list(reversed(path))
        if g > g_score.get((r, c), float('inf')) + 1e-6:
            continue
        for dr, dc in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]:
            nr, nc = r + dr, c + dc
            if not (0 <= nr < rows and 0 <= nc < cols): continue
            step = math.sqrt(2) if (dr and dc) else 1.0
            ng   = g + step * float(cost[nr, nc])
            if ng < g_score.get((nr, nc), float('inf')):
                g_score[(nr, nc)] = ng
                came_from[(nr, nc)] = (r, c)
                heapq.heappush(open_set, (ng + h(nr, nc), ng, nr, nc))

    return None


def extract_action(path: list, robot_heading: float,
                   cfg: dict, phase: str = 'to_excavation') -> tuple[float, float, int] | None:
    """
    Given a path (list of (row, col)) and robot heading (radians),
    return (left, right, bucket) for the navigation portion of a phase.
    Returns None if path is too short.
    """
    rc         = cfg.get('robot', {})
    lookahead  = cfg['planner']['lookahead']
    diff_limit = rc.get('diff_limit', 0.8)
    # Use nominal cruising speed; recovery code in dataset.py uses nav_speed_limit for escapes
    nav_limit  = float(rc.get('nav_speed_nominal', rc.get('nav_speed_limit', 1.0)))

    if len(path) < 2:
        return None

    target_idx = min(lookahead, len(path) - 1)
    tr, tc_  = path[target_idx]
    sr, sc   = path[0]

    dx = tc_ - sc
    dy = -(tr - sr)   # row ↑ = world Y ↑

    desired_heading = math.atan2(dy, dx)
    angular_error   = _angle_diff(desired_heading, robot_heading)

    # angular_norm ∈ [-1, 1]; base goes negative for turns > 90° → reverse pivot
    angular_norm = angular_error / math.pi
    mix   = float(np.clip(angular_norm, -1.0, 1.0)) * nav_limit
    base  = float(np.clip(nav_limit * (1.0 - abs(angular_norm)), -nav_limit * 0.5, nav_limit))
    left  = float(np.clip(base - mix, -nav_limit, nav_limit))
    right = float(np.clip(base + mix, -nav_limit, nav_limit))
    bucket = _BUCKET_FOR_PHASE.get(phase, 0)
    return left, right, bucket


def _angle_diff(a: float, b: float) -> float:
    d = a - b
    while d >  math.pi: d -= 2 * math.pi
    while d < -math.pi: d += 2 * math.pi
    return d


def plan_action(terrain_maps: np.ndarray, goal_heatmap: np.ndarray,
                robot_heading: float, cfg: dict,
                phase: str = 'to_excavation') -> tuple[float, float, int] | None:
    """
    Full pipeline: build cost map → A* → extract (left, right, bucket).

    For 'digging' phase: returns slow-forward + bucket=1 (no A* needed).
    For 'dumping' phase: returns stopped + bucket=2 (no A* needed).
    Returns None if no path found (navigation phases).
    """
    rc = cfg.get('robot', {})

    # Fixed-action phases — no navigation needed
    if phase == 'digging':
        spd = rc.get('digging_speed', 0.25)
        return spd, spd, 1

    if phase == 'dumping':
        return 0.0, 0.0, 2

    # Navigation phases — run A*
    gs   = cfg['terrain']['grid_size']
    half = gs // 2
    start = (half, half)

    cost     = _build_cost_map(terrain_maps, cfg)
    goal_idx = np.unravel_index(np.argmax(goal_heatmap), goal_heatmap.shape)
    goal     = (int(goal_idx[0]), int(goal_idx[1]))

    if goal == start or goal_heatmap[goal] < 0.05:
        return 0.0, 0.0, _BUCKET_FOR_PHASE.get(phase, 0)

    path = astar(cost, start, goal)
    if path is None or len(path) < 2:
        return None

    left, right, bucket = extract_action(path, robot_heading, cfg, phase)

    # Speed-aware expert: scan ahead on the planned path for obstacles.
    # Slowing the expert here means training data teaches the policy to
    # reduce speed near obstacles, not just route around them.
    pc        = cfg.get('planner', {})
    cs        = cfg['terrain']['cell_size']
    slow_r    = float(pc.get('slow_radius', 1.0))
    slow_min  = float(pc.get('slow_min',    0.35))
    n_look    = max(1, int(slow_r / cs))
    nav_limit = float(cfg.get('robot', {}).get('nav_speed_nominal',
                      cfg.get('robot', {}).get('nav_speed_limit', 1.0)))

    for pr, pc_ in path[1 : n_look + 1]:
        obs = float(terrain_maps[1][pr, pc_] + terrain_maps[2][pr, pc_])
        if obs > 0.20:
            # Scale inversely with obstacle intensity, floor at slow_min
            scale = float(np.clip(1.0 - obs * 1.8, slow_min, 1.0))
            left  = float(np.clip(left  * scale, -nav_limit, nav_limit))
            right = float(np.clip(right * scale, -nav_limit, nav_limit))
            break

    return left, right, bucket
