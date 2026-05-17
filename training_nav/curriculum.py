"""Curriculum stage definitions for OCTANE navigation training.

Stages advance based on absolute epoch numbers, not ratios of max_epochs.
This means you can set epochs=99999 to run indefinitely and stages will still
advance at the same fixed epoch counts regardless.

Stage 0 — goal-seeking          : no obstacles, robot learns to reach the goal
Stage 1 — basic avoidance       : 1-2 obstacles, learn not to crash
Stage 2 — full obstacles + DART : full obstacle set, DART positional perturbations
Stage 3 — hardening             : heavier DART, fine-tune and robustify
"""

STAGE_NAMES = {
    0: 'goal-seeking',
    1: 'basic avoidance',
    2: 'full obstacles + DART',
    3: 'hardening',
}


def get_stage(epoch: int, cc: dict) -> int:
    """Return curriculum stage (0-3) for the given epoch."""
    if epoch < cc.get('stage0_end_epoch', 40):  return 0
    if epoch < cc.get('stage1_end_epoch', 90):  return 1
    if epoch < cc.get('stage2_end_epoch', 150): return 2
    return 3


def next_stage_epoch(stage: int, cc: dict):
    """Return the first epoch of the next stage, or None if already in the final stage."""
    if stage == 0: return cc.get('stage0_end_epoch', 40)
    if stage == 1: return cc.get('stage1_end_epoch', 90)
    if stage == 2: return cc.get('stage2_end_epoch', 150)
    return None


def floor_epoch(cc: dict) -> int:
    """Earliest epoch at which early stopping is allowed (after all hard stages are seen)."""
    return cc.get('stage2_end_epoch', 150)
