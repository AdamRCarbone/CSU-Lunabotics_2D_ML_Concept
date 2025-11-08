# Testing Trained Models

## How to Test a Trained Model

After training (or during training), you can test how well your agent performs.

### Option 1: Test in Terminal (Quick)

```bash
# Test the final model
python play_model.py --model checkpoints/final_model --episodes 10

# Test a checkpoint from episode 500
python play_model.py --model checkpoints/model_episode_500 --episodes 10
```

**What you'll see:**
```
Loading model from: checkpoints/final_model.zip

Running 10 episodes with trained agent...

Episode 1:
  Reward: 45.23
  Length: 456 steps
  Orbs Collected: 2
  Orbs Deposited: 1
  Success: YES

Episode 2:
  Reward: -12.45
  Length: 234 steps
  Orbs Collected: 0
  Orbs Deposited: 0
  Success: NO
...
```

This runs the agent **headless** (no visualization) but shows you:
- Total reward per episode
- Number of steps
- Orbs collected and deposited
- Whether it succeeded

---

### Option 2: Export Model for Browser Visualization (Advanced)

To actually **see the rover moving** in the Angular app, you'd need to:

1. **Export model to ONNX format** (so browser can run it)
2. **Create inference endpoint** (Python server that Angular calls)
3. **Or use TensorFlow.js** (requires converting PyTorch model)

**Recommended approach**: Create a simple Python server that:
- Loads the trained model
- Exposes an `/predict` endpoint
- Angular app sends observation, gets back action
- Rover moves based on AI predictions

Would you like me to implement this? It's about 30 minutes of work.

---

## Understanding Results

### Good Performance:
- Reward: **Positive** (50-200+)
- Success Rate: **>50%**
- Orbs Deposited: **1-3 per episode**

### Poor Performance (needs more training):
- Reward: **Negative** (-100 to 0)
- Success Rate: **<20%**
- Orbs Deposited: **0**

### Excellent Performance:
- Reward: **>200**
- Success Rate: **>80%**
- Orbs Deposited: **3-5 per episode**
- Efficient (short episode length)

---

## Comparing Checkpoints

Test different checkpoints to see improvement:

```bash
# Early training
python play_model.py --model checkpoints/model_episode_100 --episodes 5

# Mid training
python play_model.py --model checkpoints/model_episode_500 --episodes 5

# Late training
python play_model.py --model checkpoints/model_episode_1000 --episodes 5

# Final
python play_model.py --model checkpoints/final_model --episodes 5
```

You should see rewards **increasing** over time!

---

## Next Steps

1. **Test current models**: See how well they perform
2. **Compare across training**: Episode 100 vs 500 vs 1000
3. **Identify best checkpoint**: Which episode number performed best?
4. **Decide**: Continue training or use current model?

---

## Want Visual Playback?

If you want to **watch the agent play** in the browser (like the original webapp), let me know and I'll build:
- Python inference server (runs the model)
- Angular component (visualizes the agent)
- WebSocket connection (real-time updates)

This way you can see the trained rover actually navigating, collecting orbs, and depositing them!
