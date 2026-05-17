"""NavPolicy — feedforward CNN→MLP navigation policy.

~0.7 M parameters.  No recurrence — the A* planner handles path planning;
this network just learns to reactively execute one step at a time.

Input (single frame):
  terrain:    (B, 5, gs, gs)  — height, rocks, craters, walls, goal heatmap
  heading:    (B, 2)          — [sin(yaw), cos(yaw)]
  zone_idx:   (B,)  long      — current arena zone (0-5)
  arena_type: (B,)  float     — 0.0=UCF  1.0=KSC
  phase_idx:  (B,)  long      — mission phase (0-3)
  hidden:     ignored         — accepted for API compat with inference code

Output: (B, 5), None
  [0:2]  motor commands — tanh  [-1, 1]  (multiply by nav_speed_limit for m/s)
  [2:5]  bucket logits  — raw CrossEntropy input (0=UP 1=COLLECT 2=DUMP)

Architecture:
  CNN  : 3× [Conv-BN-ReLU-MaxPool2d]  channels [64, 128, 256]  →  AdaptiveAvgPool2d(1)
  Aux  : heading Linear(2→16), zone Embedding(6→8), arena Linear(1→8), phase Embedding(4→8)
  MLP  : [256, 128] ReLU  →  motor head (2)+tanh,  bucket head (3)
"""

import torch
import torch.nn as nn


class NavPolicy(nn.Module):

    def __init__(self, cfg: dict):
        super().__init__()
        mc = cfg['model']
        ch = mc.get('cnn_channels', [64, 128, 256])
        he = mc.get('heading_embed_dim', 16)
        ae = mc.get('arena_embed_dim',   8)
        ze = mc.get('zone_embed_dim',    8)
        ph = mc.get('phase_embed_dim',   8)
        fc_dims = mc.get('fc_dims', [256, 128])

        # CNN encoder
        layers, in_ch = [], 5
        for out_ch in ch:
            layers += [
                nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
                nn.BatchNorm2d(out_ch),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2),
            ]
            in_ch = out_ch
        self.cnn = nn.Sequential(*layers)
        self.gap = nn.AdaptiveAvgPool2d(1)  # → (B, ch[-1])

        # Auxiliary encoders
        self.heading_mlp = nn.Sequential(nn.Linear(2, he), nn.ReLU(inplace=True))
        self.zone_emb    = nn.Embedding(6, ze)
        self.arena_mlp   = nn.Sequential(nn.Linear(1, ae), nn.ReLU(inplace=True))
        self.phase_emb   = nn.Embedding(4, ph)

        # MLP
        feat = ch[-1] + he + ze + ae + ph
        mlp = []
        for dim in fc_dims:
            mlp += [nn.Linear(feat, dim), nn.ReLU(inplace=True)]
            feat = dim
        self.mlp = nn.Sequential(*mlp)

        self.motor_head  = nn.Linear(feat, 2)
        self.bucket_head = nn.Linear(feat, 3)

    def forward(self, terrain, heading, zone_idx, arena_type, phase_idx, hidden=None):
        x = self.gap(self.cnn(terrain)).flatten(1)              # (B, ch[-1])
        h = self.heading_mlp(heading)                           # (B, 16)
        z = self.zone_emb(zone_idx)                             # (B, 8)
        a = self.arena_mlp(arena_type.unsqueeze(-1).float())    # (B, 8)
        p = self.phase_emb(phase_idx)                           # (B, 8)

        feat   = torch.cat([x, h, z, a, p], dim=1)
        out    = self.mlp(feat)
        motors = torch.tanh(self.motor_head(out))
        bucket = self.bucket_head(out)
        return torch.cat([motors, bucket], dim=1), None  # None = no hidden state

    @staticmethod
    def decode(out: torch.Tensor):
        """Split (..., 5) output into (motors, bucket_class)."""
        return out[..., :2], out[..., 2:].argmax(dim=-1)
