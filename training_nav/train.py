"""OCTANE Navigation Policy — training entry point.

Usage:
  python training_nav/train.py
  python training_nav/train.py --config training_nav/config.yaml
  python training_nav/train.py --headless
"""

import argparse
import os
import sys

import torch
import yaml
from torch.utils.data import DataLoader

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from training_nav import checkpoints, dashboard
from training_nav.dataset import NavDataset
from training_nav.model import NavPolicy
from training_nav.trainer import run_training


def main():
    # Windows cp1252 can't encode box/arrow chars — force UTF-8 for all output
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

    _dir = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser()
    parser.add_argument('--config',   default=os.path.join(_dir, 'config.yaml'))
    parser.add_argument('--headless', action='store_true')
    parser.add_argument('--view',     action='store_true')
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    tc     = cfg['training']
    cc_cfg = cfg['checkpoints']
    if not os.path.isabs(cc_cfg['dir']):
        cc_cfg['dir'] = os.path.join(_dir, cc_cfg['dir'])

    torch.manual_seed(tc['seed'])
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    device_label = (f'cuda ({torch.cuda.get_device_name(0)})'
                    if torch.cuda.is_available() else 'cpu')

    print(f'\n  OCTANE  Navigation Policy Training')
    print(f'  ---------------------------------')
    print(f'  Device : {device_label}')

    if args.headless:
        max_epochs = tc['epochs']
        open_gui   = args.view
    else:
        raw = input(f'\n  Epochs to train (Enter for {tc["epochs"]}): ').strip()
        max_epochs = int(raw) if raw else tc['epochs']
        if not args.view:
            raw = input('  Open live training dashboard? [y/N]: ').strip().lower()
            open_gui = raw in ('y', 'yes')
        else:
            open_gui = True

    if open_gui:
        dashboard.start(port=8767)
        import webbrowser
        print('  Dashboard → http://localhost:8767')
        webbrowser.open('http://localhost:8767')

    dashboard.update(epochs=max_epochs, device=device_label, status='running')

    n_train = int(tc['arenas_per_epoch'] * tc['samples_per_arena'] * (1 - tc['val_ratio']))
    n_val   = int(tc['arenas_per_epoch'] * tc['samples_per_arena'] * tc['val_ratio'])
    nw_cfg  = tc.get('num_workers', 0)
    nw      = max(2, int((os.cpu_count() or 4) * 0.75)) if nw_cfg < 0 else nw_cfg
    pin     = torch.cuda.is_available()

    train_ds = NavDataset(cfg, n_train, seed=tc['seed'])
    val_ds   = NavDataset(cfg, n_val,   seed=tc['seed'] + 1)

    persist = nw > 0
    train_loader = DataLoader(train_ds, batch_size=tc['batch_size'], shuffle=True,
                              num_workers=nw, pin_memory=pin, persistent_workers=persist)
    val_loader   = DataLoader(val_ds,   batch_size=tc['batch_size'], shuffle=False,
                              num_workers=nw, pin_memory=pin, persistent_workers=persist)

    seq_len = cfg['model']['seq_len']
    print(f'  Train  : {n_train} samples/epoch  ({tc["batch_size"]} batch x {seq_len} seq = {tc["batch_size"]*seq_len} frames/step)')
    print(f'  Val    : {n_val} samples/epoch')
    print(f'  Workers: {nw}')

    model     = NavPolicy(cfg).to(device)
    optimizer = torch.optim.AdamW(model.parameters(),
                                  lr=tc['learning_rate'], weight_decay=tc['weight_decay'])
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer, T_0=max_epochs, T_mult=1, eta_min=tc['learning_rate'] * 0.01)

    start_epoch = 1
    best_val    = float('inf')

    ckpt_path = checkpoints.find_latest(cc_cfg['dir'])
    if ckpt_path:
        print(f'\n  Resuming from {os.path.basename(ckpt_path)}')
        try:
            start_epoch, best_val = checkpoints.load(
                ckpt_path, model, optimizer, scheduler, device)
        except RuntimeError as e:
            print(f'  Checkpoint incompatible: {e}')
            print('  Starting from scratch.\n')
    else:
        print()

    run_training(
        cfg=cfg, model=model, optimizer=optimizer, scheduler=scheduler,
        train_loader=train_loader, val_loader=val_loader,
        train_ds=train_ds, val_ds=val_ds,
        device=device, max_epochs=max_epochs,
        start_epoch=start_epoch, best_val=best_val,
        ckpt_dir=cc_cfg['dir'], keep=cc_cfg.get('keep', 10),
    )


if __name__ == '__main__':
    main()
