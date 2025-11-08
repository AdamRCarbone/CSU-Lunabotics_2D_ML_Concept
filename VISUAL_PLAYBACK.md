# Visual Playback - Watch Your Trained Model!

## Quick Setup (3 steps)

### Step 1: Start the Inference Server

```bash
cd python_training

# Start server (loads a model)
python inference_server.py --model checkpoints/final_model
```

Server runs on `http://localhost:5001`

---

### Step 2: Test the Model Works

```bash
# In another terminal
python play_model.py --model checkpoints/final_model --episodes 5
```

You should see successful episodes with positive rewards!

---

### Step 3: List Available Models

Open browser to: `http://localhost:5001/models`

You'll see JSON with all your trained checkpoints!

---

## How It Works

The inference server:
1. **Loads** your trained `.zip` model
2. **Exposes** HTTP endpoints:
   - `POST /predict` - Get action from model
   - `GET /models` - List available checkpoints
   - `POST /load_model` - Switch to different checkpoint
3. **Angular app** can connect and visualize

---

## Testing Different Models

### Load a different checkpoint:

```bash
# Stop the server (Ctrl+C)
# Start with different model
python inference_server.py --model checkpoints/model_episode_500
```

Or use the API:
```bash
curl -X POST http://localhost:5001/load_model \
  -H "Content-Type: application/json" \
  -d '{"model_path": "checkpoints/model_episode_1000"}'
```

---

## What You Can Do Now

### 1. **Test models in terminal** (headless - fast)
```bash
python play_model.py --model checkpoints/final_model --episodes 10
```

### 2. **Run inference server** (for future Angular integration)
```bash
python inference_server.py --model checkpoints/final_model
```

### 3. **Compare checkpoints**
```bash
# Test early training
python play_model.py --model checkpoints/model_episode_10000 --episodes 5

# Test later training
python play_model.py --model checkpoints/model_episode_20000 --episodes 5

# Compare results!
```

---

## Next: Angular Visual Playback (TODO)

To actually **watch the rover move** in the browser, we need to:

1. ✅ Inference server (done!)
2. ✅ Angular service to connect (done!)
3. ⏳ **Add "AI Mode" toggle to original app**
4. ⏳ **Connect app to inference server**
5. ⏳ **Loop: get observation → call server → apply action → update visualization**

This is about 1 hour of work. Want me to build it?

It would let you:
- Load any checkpoint from a dropdown
- Watch the AI navigate in real-time
- See the rover collect and deposit orbs
- Switch between manual and AI control
- **Visually confirm training worked!**

---

## For Now: Use Terminal Testing

The `play_model.py` script tells you everything you need:
- ✅ Did the model learn?
- ✅ What's the success rate?
- ✅ How many orbs deposited?
- ✅ Compare different checkpoints

**Want the visual Angular integration? Let me know and I'll build it!**
