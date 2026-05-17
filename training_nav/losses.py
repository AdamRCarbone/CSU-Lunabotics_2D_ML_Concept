"""Loss for OCTANE navigation policy — pure imitation learning.

Total loss = Huber(motors) + bucket_loss_weight * CrossEntropy(bucket)

No regularization terms.  The A* expert signal is clean enough that
behavioral cloning alone drives convergence.
"""

import torch.nn.functional as F


def compute_loss(motor_pred, bucket_pred, action_gt, criterion, bucket_loss_weight: float):
    """
    Args:
        motor_pred:         (N, 2)   predicted left/right motor commands
        bucket_pred:        (N, 3)   predicted bucket logits
        action_gt:          (N, 3)   ground-truth [left, right, bucket_class]
        criterion:          HuberLoss instance
        bucket_loss_weight: weight on CrossEntropy bucket loss

    Returns:
        total_loss (scalar), pred_mag (N,) per-sample motor magnitude
    """
    motor_loss  = criterion(motor_pred, action_gt[:, :2])
    bucket_loss = F.cross_entropy(bucket_pred, action_gt[:, 2].long())
    pred_mag    = motor_pred.abs().mean(dim=-1)
    total       = motor_loss + bucket_loss_weight * bucket_loss
    return total, pred_mag
