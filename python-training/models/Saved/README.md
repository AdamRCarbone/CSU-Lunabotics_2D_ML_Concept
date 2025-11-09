# Saved Models

This folder is for storing important model checkpoints that you want to track in Git.

## Usage

Move any model checkpoints you want to preserve into this folder:

```bash
# Example: Save a particularly good model
cp lunar_rover_ppo_1000000_steps.zip Saved/lunar_rover_ppo_1000000_steps_good_performance.zip
```

## Notes

- All `.zip` files in this folder will be tracked by Git
- Models in the parent `models/` directory are ignored by Git
- Consider renaming models with descriptive names when saving them
- Add notes below about each saved model for future reference

## Saved Model Notes

### Example Entry
- **File**: `lunar_rover_ppo_1000000_steps_baseline.zip`
- **Date**: 2025-01-15
- **Performance**: 85% success rate, avg reward: +145
- **Notes**: First successful model after reward rebalancing

---

Add your model notes below:

