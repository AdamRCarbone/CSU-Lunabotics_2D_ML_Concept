# How to Use AI Visual Playback

You can now watch your trained models control the rover in real-time in the browser!

## Setup (3 steps)

### Step 1: Start the Inference Server

```bash
cd python_training

# Start server (loads a model on startup)
python inference_server.py --model checkpoints/final_model
```

The server runs on `http://localhost:5001` and loads your trained model.

---

### Step 2: Start the Angular App

```bash
cd webapp/ml-navigation

# Start the Angular development server
ng serve
```

Open browser to `http://localhost:4200`

---

### Step 3: Load and Run the Model

In the Angular app:

1. **Select Control Mode**: Click the dropdown under "AI Model Control" and select "AI Control"
2. **Select Model**: Choose a model from the dropdown (populated from your checkpoints folder)
3. **Click "Load & Run Model"**: The AI will start controlling the rover
4. **Watch**: See the rover navigate, collect orbs, and deposit them based on your trained model!
5. **Stop**: Click "Stop AI" to return to manual control

---

## What You'll See

- **Rover moving autonomously** based on AI predictions
- **Real-time control**: The AI makes decisions 20 times per second (50ms intervals)
- **Status indicators**:
  - ✓ AI is controlling the rover (green)
  - ⏳ Loading model... (orange)
  - ✗ Error loading model (red)
- **Manual controls disabled** when AI is active
- **Seamless switching** between manual and AI control

---

## How It Works

1. **Observation**: Every 50ms, the app reads the current state:
   - Rover position, velocity, angle
   - Current zone (mining, collection, etc.)
   - Detected obstacles and orbs (distance & angle)

2. **Prediction**: Sends observation to inference server → model predicts action

3. **Action**: Applies the action to the rover:
   - Linear velocity (speed)
   - Target heading (rotation)
   - Dig mode (grab/release orbs)

4. **Visualization**: You see the rover move in real-time as the AI controls it

---

## Testing Different Models

The model dropdown automatically lists all `.zip` checkpoints in `python_training/checkpoints/`:

- `model_episode_10000` - Early training
- `model_episode_20000` - Mid training
- `model_episode_30000` - Later training
- `final_model` - Final trained model

You can switch between models on-the-fly to compare their performance!

---

## Troubleshooting

**Dropdown is empty:**
- Make sure the inference server is running (`python inference_server.py`)
- Check that you have `.zip` files in `python_training/checkpoints/`

**"Error loading model":**
- Verify the inference server is running
- Check the browser console (F12) for error messages
- Make sure the selected model path is valid

**AI not controlling rover:**
- Ensure you clicked "Load & Run Model" (not just selected the model)
- Check the status indicator shows "✓ AI is controlling the rover"
- Verify the inference server console shows successful predictions

---

## Next Steps

Now that you can visually see your models in action, you can:

1. **Compare checkpoints**: Load different episodes to see training progress
2. **Evaluate performance**: Does the AI collect and deposit orbs efficiently?
3. **Identify issues**: See if the AI gets stuck, misses orbs, or collides with obstacles
4. **Iterate training**: If the model isn't performing well, adjust hyperparameters and retrain

Enjoy watching your trained rover navigate autonomously!
