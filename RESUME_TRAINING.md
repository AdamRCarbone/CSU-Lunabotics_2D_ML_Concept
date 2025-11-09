# Resume Training Guide

## Problem: Training Was Stuck in Stage 1

Your training was using **STAGE_1_DRIVING_CONTROL** which has:
- ❌ **ALL orb rewards = 0** (grab, deposit, etc.)
- ✅ Only smooth driving rewards

The model learned to drive smoothly but **never learned to collect orbs** because there was no reward for doing so!

---

## Solution: Resume with Stage 3 or 4

You now have **resume capability** and **stage selection**!

### Resume from Latest Checkpoint with Better Rewards

```bash
cd python_training
venv\Scripts\activate

# Resume from episode 70550 with STAGE 3 (Orb Collection)
python train_sb3.py --resume checkpoints/final_model_episode_70550 --stage 3

# OR resume with STAGE 4 (Full Task - highest rewards)
python train_sb3.py --resume checkpoints/final_model_episode_70550 --stage 4
```

---

## Training Stages Explained

### Stage 1: Driving Control (What you were using)
- Smooth acceleration: +0.5
- Smooth turning: +0.5
- **Grab orb: 0.0** ❌
- **Deposit: 0.0** ❌
- Purpose: Learn basic driving skills

### Stage 2: Navigation
- Navigate between zones
- **Still no orb rewards** ❌
- Purpose: Learn to move between areas

### Stage 3: Orb Collection ⭐ **Recommended**
- **Grab orb: +20.0** ✅
- **Leave excavation with orbs: +50.0**
- **Enter construction: +150.0**
- **Deposit berm: +1500** ✅
- **Deposit construction: +700**
- **Return to excavation: +50.0**
- Purpose: Learn full task with exploration bonus

### Stage 4: Full Task 🚀 **Most Aggressive**
- **Grab orb: +15.0** ✅
- **Enter construction: +100.0**
- **Deposit berm: +2000** ✅✅
- **Deposit construction: +1000**
- **Return: +150.0**
- Penalties are also higher (encourages efficiency)
- Purpose: Competition-optimized rewards

---

## Recommended Strategy

### Option A: Stage 3 (Safer, More Exploration)
```bash
python train_sb3.py --resume checkpoints/final_model_episode_70550 --stage 3
```
- Good for letting the model explore and discover orbs
- Higher initial rewards for grabbing
- More forgiving

### Option B: Stage 4 (Aggressive, Competition-Ready)
```bash
python train_sb3.py --resume checkpoints/final_model_episode_70550 --stage 4
```
- Huge rewards for deposits (2000 for berm!)
- Strong penalties for inefficiency
- Best for final training

---

## What Will Change

When you resume with Stage 3 or 4:

1. **Orb collection becomes highly rewarded**
   - Model will start exploring towards orbs
   - Grabbing orbs gives +15-20 points immediately

2. **Deposits give HUGE rewards**
   - Berm deposit: +1500 to +2000 points
   - Construction deposit: +700 to +1000 points

3. **Model inherits previous driving skills**
   - The smooth driving it learned in Stage 1 is preserved
   - Now it learns the actual task on top of those skills

4. **You should see on the graph:**
   - Initial spike in rewards as model discovers orbs
   - "Orbs Collected" metric increasing
   - "Orbs Deposited" metric starting to show >0

---

## Monitor Progress

Open the dashboard: `http://localhost:4200` → "Training Monitor"

Watch for:
- ✅ **Orbs Collected** > 0
- ✅ **Orbs Deposited** > 0
- ✅ **Reward graph trending upward** (not cyclic anymore)

If after ~5000 more episodes you still see 0 orbs collected, the model might need:
- Even higher orb rewards (we can manually boost them)
- Reward shaping to guide it toward orbs
- Curriculum: Train on Stage 3 first, then Stage 4

---

## Starting Fresh (Alternative)

If you want to start completely fresh with Stage 3:

```bash
# Start new training from scratch with Stage 3
python train_sb3.py --stage 3
```

This will create a new model that learns orb collection from the beginning.

---

## Quick Reference

```bash
# Resume from latest with Stage 3
python train_sb3.py --resume checkpoints/final_model_episode_70550 --stage 3

# Resume from latest with Stage 4
python train_sb3.py --resume checkpoints/final_model_episode_70550 --stage 4

# Resume from specific checkpoint
python train_sb3.py --resume checkpoints/model_episode_50000 --stage 3

# Start fresh with Stage 3
python train_sb3.py --stage 3
```

---

## Expected Results

After switching to Stage 3/4, you should see within ~10k episodes:
- Model starts grabbing orbs (orbs_collected > 0)
- Eventually deposits them (orbs_deposited > 0)
- Rewards spike upward when deposits happen
- Graph shows upward trend instead of cycles

The cyclic pattern means it found a local optimum. With orb rewards enabled, it will break out and learn the actual task!
