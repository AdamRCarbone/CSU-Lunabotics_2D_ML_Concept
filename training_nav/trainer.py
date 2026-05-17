"""Core training loop for OCTANE navigation policy."""

import gc
import time

import torch
import torch.nn as nn
from torch.amp import GradScaler, autocast
from tqdm import tqdm

from training_nav import checkpoints, dashboard
from training_nav.losses import compute_loss

_SEP = '  ' + '─' * 63


def run_epoch(loader, model, criterion, optimizer, device, *,
              train: bool, grad_clip: float, bucket_loss_weight: float,
              scaler: GradScaler | None = None):
    """One training or validation pass.

    The dataset returns (B, T, ...) sequences.  We flatten T into the batch
    so the feedforward model sees independent (B*T, ...) samples — no hidden
    state, no recurrence, each timestep is its own prediction.

    Returns:
        (mean_loss, mean_pred_magnitude)
    """
    model.train(train)
    total_loss = 0.0
    total_pmag = 0.0
    use_amp = scaler is not None and device.type == 'cuda'
    desc = 'train' if train else 'val  '

    with torch.set_grad_enabled(train):
        bar = tqdm(loader, desc=desc, leave=False,
                   bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} '
                               '[{elapsed}<{remaining}  {postfix}]')

        for terrain, heading, zone_idx, arena_type, phase_idx, action_gt in bar:
            terrain    = terrain.to(device, non_blocking=True)    # (B, T, 5, H, W)
            heading    = heading.to(device, non_blocking=True)    # (B, T, 2)
            zone_idx   = zone_idx.to(device, non_blocking=True)   # (B, T)
            arena_type = arena_type.to(device, non_blocking=True) # (B,)
            phase_idx  = phase_idx.to(device, non_blocking=True)  # (B,)
            action_gt  = action_gt.to(device, non_blocking=True)  # (B, T, 3)

            B, T, C, H, W = terrain.shape

            # Flatten time into batch — each step is an independent sample
            t_flat  = terrain.reshape(B * T, C, H, W)
            h_flat  = heading.reshape(B * T, 2)
            z_flat  = zone_idx.reshape(B * T)
            at_flat = arena_type.unsqueeze(1).expand(B, T).reshape(B * T)
            ph_flat = phase_idx.unsqueeze(1).expand(B, T).reshape(B * T)
            gt_flat = action_gt.reshape(B * T, 3)

            with autocast('cuda', enabled=use_amp):
                out, _ = model(t_flat, h_flat, z_flat, at_flat, ph_flat)
                loss, pred_mag = compute_loss(
                    out[:, :2], out[:, 2:], gt_flat, criterion, bucket_loss_weight)

            if train:
                optimizer.zero_grad()
                if use_amp:
                    scaler.scale(loss).backward()
                    scaler.unscale_(optimizer)
                    if grad_clip > 0:
                        nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    loss.backward()
                    if grad_clip > 0:
                        nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
                    optimizer.step()

            lv = loss.item()
            pm = pred_mag.mean().item()
            total_loss += lv
            total_pmag += pm
            bar.set_postfix_str(f'L={lv:.4f} mag={pm:.3f}')

    n = max(len(loader), 1)
    return total_loss / n, total_pmag / n


def run_training(cfg, model, optimizer, scheduler,
                 train_loader, val_loader, train_ds, val_ds,
                 device, max_epochs, start_epoch=1, best_val=float('inf'),
                 ckpt_dir='checkpoints', keep=10):
    """Full training loop — no curriculum weight switching, pure imitation."""
    tc = cfg['training']
    criterion          = nn.HuberLoss(delta=0.1)
    bucket_loss_weight = tc.get('bucket_loss_weight', 0.5)
    display_scale      = tc.get('loss_display_scale', 100.0)
    scaler             = GradScaler('cuda') if device.type == 'cuda' else None
    patience           = max(tc['early_stop_patience'], max_epochs // 50)

    train_losses, val_losses = [], []
    train_mags,   val_mags   = [], []
    lrs = []
    no_improve = 0
    prev_val   = float('inf')
    t0         = time.time()

    for epoch in range(start_epoch, max_epochs + 1):
        train_ds.reshuffle(epoch)
        val_ds.epoch = epoch

        train_loss, train_pmag = run_epoch(
            train_loader, model, criterion, optimizer, device,
            train=True, grad_clip=tc['grad_clip'],
            bucket_loss_weight=bucket_loss_weight, scaler=scaler)

        val_loss, val_pmag = run_epoch(
            val_loader, model, criterion, optimizer, device,
            train=False, grad_clip=0,
            bucket_loss_weight=bucket_loss_weight)

        scheduler.step()
        lr = scheduler.get_last_lr()[0]

        train_losses.append(train_loss); val_losses.append(val_loss)
        train_mags.append(train_pmag);   val_mags.append(val_pmag)
        lrs.append(lr)

        delta_val = val_loss - prev_val
        improved  = val_loss < best_val
        if improved:
            best_val = val_loss; no_improve = 0
        else:
            no_improve += 1
        prev_val = val_loss

        elapsed = time.time() - t0
        _print_epoch(epoch, max_epochs, train_loss, val_loss, delta_val,
                     train_pmag, val_pmag, best_val, no_improve, patience,
                     lr, elapsed, improved, display_scale)

        dashboard.update(
            epoch=epoch, epochs=max_epochs,
            train_loss=train_losses, val_loss=val_losses,
            train_mag=train_mags,    val_mag=val_mags,
            lr=lrs, best_val=best_val,
            no_improve=no_improve, patience=patience,
            elapsed_s=round(elapsed), status='running',
            stage=0, stage_name='imitation',
        )

        checkpoints.save(ckpt_dir, epoch, model, optimizer, scheduler,
                         val_loss, best_val, keep=keep)

        if epoch >= max(10, max_epochs // 10) and no_improve >= patience:
            print(f'  [ stale: no improvement for {no_improve} epochs — continuing ]')

        gc.collect()

    dashboard.update(status='done')
    print(f'\n  Done.  Best val loss: {best_val * display_scale:.2f} (×{int(display_scale)})\n')


def _print_epoch(epoch, max_epochs, train_loss, val_loss, delta_val,
                 train_pmag, val_pmag, best_val, no_improve, patience,
                 lr, elapsed, improved, display_scale=100.0):
    def _t(s):
        if s < 60:   return f'{int(s)}s'
        if s < 3600: return f'{int(s)//60}m {int(s)%60:02d}s'
        return f'{int(s)//3600}h {(int(s)%3600)//60:02d}m'
    sc     = display_scale
    arrow  = '↓' if delta_val < 0 else ('↑' if delta_val > 0 else '─')
    marker = '  * new best' if improved else ''
    slabel = f'(×{int(sc)})' if sc != 1.0 else ''
    print(_SEP)
    print(f'  Epoch {epoch:05d} / {max_epochs}')
    print(_SEP)
    print(f'  train : {train_loss*sc:.2f} {slabel}   val : {val_loss*sc:.2f} {arrow}   '
          f'Δval : {delta_val*sc:+.2f}{marker}')
    print(f'  best  : {best_val*sc:.2f}        no-improve : {no_improve}/{patience}    '
          f'lr : {lr:.2e}')
    print(f'  t_mag : {train_pmag:.3f}          v_mag      : {val_pmag:.3f}        '
          f'time : {_t(elapsed)}')
