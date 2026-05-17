"""Checkpoint save / load / discovery for OCTANE navigation training."""

import glob
import os
import shutil

import torch


def find_latest(ckpt_dir: str):
    """Return path to the most recent epoch_XXXX.pt file, or None."""
    paths = sorted(glob.glob(os.path.join(ckpt_dir, 'epoch_*.pt')))
    return paths[-1] if paths else None


def save(ckpt_dir: str, epoch: int, model, optimizer, scheduler,
         val_loss: float, best_val: float, keep: int = 10):
    """Save a checkpoint and update best.pt if val_loss is a new best.

    Prunes old epoch_XXXX.pt files keeping only the most recent `keep`.
    """
    os.makedirs(ckpt_dir, exist_ok=True)
    data = {
        'epoch':     epoch,
        'model':     model.state_dict(),
        'optimizer': optimizer.state_dict(),
        'scheduler': scheduler.state_dict(),
        'val_loss':  val_loss,
        'best_val':  best_val,
    }
    epoch_path = os.path.join(ckpt_dir, f'epoch_{epoch:04d}.pt')
    torch.save(data, epoch_path)

    if val_loss <= best_val:
        shutil.copy2(epoch_path, os.path.join(ckpt_dir, 'best.pt'))

    old = sorted(glob.glob(os.path.join(ckpt_dir, 'epoch_*.pt')))[:-keep]
    for p in old:
        os.remove(p)


def load(ckpt_path: str, model, optimizer, scheduler, device):
    """Load checkpoint state into model / optimizer / scheduler.

    Returns:
        (start_epoch, best_val) — resume from start_epoch with known best_val.

    Raises RuntimeError if the model architecture is incompatible.
    """
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    model.load_state_dict(ckpt['model'])
    optimizer.load_state_dict(ckpt['optimizer'])
    scheduler.load_state_dict(ckpt['scheduler'])
    return ckpt['epoch'] + 1, ckpt.get('best_val', float('inf'))
