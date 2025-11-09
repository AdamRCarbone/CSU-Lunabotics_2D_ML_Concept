# Training Environment Comparison

## TypeScript (Original) vs Python (New Headless)

### ⚠️ **CRITICAL DIFFERENCES** ⚠️

The Python headless training environment is **NOT** the same as your TypeScript browser-based training. Here are the major differences:

---

## 1. Observation Space (DIFFERENT)

### TypeScript (33 dimensions):
```typescript
[
  rover_x,                          // 0-1 normalized
  rover_y,                          // 0-1 normalized
  rover_heading,                    // 0-1 normalized (0-360° → 0-1)
  rover_speed,                      // -1 to 1
  is_holding_orbs,                  // 0 or 1
  num_orbs_held,                    // 0-1 normalized (0-15)
  in_excavation_zone,               // 0 or 1
  in_construction_zone,             // 0 or 1
  in_berm_zone,                     // 0 or 1
  in_obstacle_zone,                 // 0 or 1
  nearest_orb_distance,             // 0-1 normalized
  nearest_orb_angle,                // -1 to 1 (relative to heading)
  nearest_orb_in_grab_zone,         // 0 or 1
  ...obstacles (15 values),         // [dist, angle, radius] × 5
  construction_zone_distance,       // 0-1 normalized
  construction_zone_angle           // -1 to 1 (relative to heading)
]
```

### Python (28 dimensions):
```python
[
  rover_x,                          // meters (0 to world_width)
  rover_y,                          // meters (0 to world_height)
  rover_vx,                         // m/s velocity
  rover_vy,                         // m/s velocity
  rover_angle,                      // radians (-π to π)
  rover_angular_vel,                // radians/sec
  zone,                             // enum (0-5)
  holding_orb,                      // 0 or 1
  ...obstacles (10 values),         // [dist, angle] × 5
  ...orbs (10 values)               // [dist, angle] × 5
]
```

**Key Differences:**
- TypeScript uses **normalized values** (0-1), Python uses **raw physical units**
- TypeScript includes **zone booleans**, Python uses **single zone enum**
- TypeScript includes **num_orbs_held**, Python only has **binary holding_orb**
- TypeScript includes **obstacle radius**, Python only has **distance/angle**
- TypeScript includes **nearest_orb_distance**, Python has **detected orbs array**
- TypeScript includes **construction_zone_distance/angle**, Python doesn't

---

## 2. Action Space (DIFFERENT)

### TypeScript:
```typescript
[
  speed,        // -1 to 1 (forward/backward)
  turn_rate,    // -1 to 1 (turn left/right)
  dig_action    // 0 to 1 (threshold at 0.5)
]
```

### Python:
```python
[
  linear_velocity,    // -1 to 1 (speed multiplier)
  angular_velocity,   // -1 to 1 (angular velocity multiplier)
  dig_action          // 0 to 1 (threshold at 0.5)
]
```

**Note:** Turn rate vs angular velocity are similar but may behave differently.

---

## 3. Reward Structure (COMPLETELY DIFFERENT)

### TypeScript Has Detailed Progression Rewards:
- ✓ Grab orb reward (+15-20)
- ✓ Leave excavation with orbs (+40-50)
- ✓ Enter obstacle with orbs (+75) - Stage 3
- ✓ Enter construction with orbs (+100-150)
- ✓ Deposit berm (+500-2000 depending on stage)
- ✓ Deposit construction (+400-1000)
- ✓ Return to excavation (+50-150)
- ✓ Holding orbs per-step rewards (zone-dependent)
- ✓ Smooth control rewards (acceleration, turning, heading maintenance)
- ✓ Speed consistency rewards
- ✓ Idle penalties
- ✓ Forward/backward movement penalties
- ✓ Oscillation penalties
- ✓ Wasteful drop penalties
- ✓ Shaping rewards (optional distance-based)

### Python Has Basic Rewards:
- ❌ Simple placeholder reward system
- ❌ No progression tracking
- ❌ No smooth control rewards
- ❌ No multi-stage curriculum
- ❌ Basic collision penalty

**The Python environment was a simplified starting point and does NOT match your sophisticated TypeScript reward system!**

---

## 4. Environment Features

### TypeScript (Full Browser Simulation):
- ✓ Matter.js physics engine
- ✓ p5.js visualization
- ✓ Frustum detection (angular field of view)
- ✓ Grab zones
- ✓ Multiple orbs (15 max)
- ✓ Zones: Starting, Excavation, Obstacle, Construction, Target Berm
- ✓ Rocks and craters
- ✓ WebSocket communication with Python

### Python (Simplified Headless):
- ✓ Custom NumPy physics (simplified)
- ✓ Basic frustum detection
- ✗ Single orb only (holding_orb is binary)
- ✓ Same zones
- ✓ Rocks and craters (simplified)
- ✗ No browser visualization

---

## 5. Training Configuration

### TypeScript Has 4-Stage Curriculum:
1. **STAGE_1_DRIVING_CONTROL** - Smooth driving & collision avoidance
2. **STAGE_2_NAVIGATION** - Navigate to construction zone
3. **STAGE_3_ORB_COLLECTION** - Collect and deliver orbs
4. **STAGE_4_FULL_TASK** - Competition-optimized full task

Each stage has carefully tuned rewards!

### Python:
- Single basic reward configuration
- No curriculum learning

---

## What This Means

### ✅ **The models you trained in Python**:
- Were trained on a **simplified** environment
- Have **different observation/action spaces**
- Used **basic rewards** (not your sophisticated TypeScript system)
- May not work well in the real browser environment

### ❌ **The TypeScript training system**:
- Has sophisticated rewards
- Has curriculum learning
- Was designed for NASA Lunabotics competition objectives
- **This is what you should actually be using for training!**

---

## Recommendation

You have TWO options:

### Option A: Use TypeScript Browser Training (Your Original System)
**Pros:**
- Already has sophisticated rewards
- Matches your actual environment
- Has curriculum learning
- Full visualization

**Cons:**
- Slower (browser physics bottleneck)
- Requires Python WebSocket server

### Option B: Port TypeScript Rewards to Python
**Work Required:**
1. Copy all reward logic from `ml-reward.ts` to Python environment
2. Match observation space exactly (33 dimensions)
3. Implement curriculum stages
4. Add multi-orb support
5. **LOTS of work** (~4-8 hours)

---

## My Recommendation

**Keep using your TypeScript browser-based training!** It's already sophisticated and complete. The Python headless training I built was meant to be faster, but it doesn't have your reward system implemented yet.

If you want to use the Python training, we need to port ALL of your TypeScript reward logic, which is a significant amount of work.

What would you like to do?
