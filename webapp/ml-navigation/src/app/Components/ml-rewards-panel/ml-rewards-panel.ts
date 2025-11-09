// ML Rewards Configuration Panel Component

import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MLEnvironmentService } from '../../services/ml-environment';
import {
  DEFAULT_ML_CONFIG,
  MLConfig,
  STAGE_1_DRIVING_CONTROL,
  STAGE_2_NAVIGATION,
  STAGE_3_ORB_COLLECTION,
  STAGE_4_FULL_TASK
} from '../../interfaces/ml-types';

interface RewardConfigItem {
  key: keyof MLConfig;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  category: string;
}

@Component({
  selector: 'app-ml-rewards-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ml-rewards-panel.html',
  styleUrl: './ml-rewards-panel.css'
})
export class MLRewardsPanel implements OnInit {
  private mlEnvironment = inject(MLEnvironmentService);

  // Current config values
  config: Partial<MLConfig> = {};

  // Collapsible sections (start with all collapsed)
  expandedCategories: Set<string> = new Set();

  // Training presets
  selectedPreset: string = 'stage4';
  presets = [
    {
      id: 'stage1',
      name: 'Stage 1: Driving & Control',
      description: 'Learn smooth, precise driving with no jitter. Focus on forward movement and obstacle avoidance.',
      config: STAGE_1_DRIVING_CONTROL
    },
    {
      id: 'stage2',
      name: 'Stage 2: Navigation',
      description: 'Learn to navigate to construction zone. Builds on smooth control, adds goal-directed movement.',
      config: STAGE_2_NAVIGATION
    },
    {
      id: 'stage3',
      name: 'Stage 3: Orb Collection',
      description: 'Learn to pick up orbs and deliver them. Combines navigation with task completion.',
      config: STAGE_3_ORB_COLLECTION
    },
    {
      id: 'stage4',
      name: 'Stage 4: Full Task',
      description: 'Optimize complete task: smooth driving + navigation + orb delivery. Best for continued training.',
      config: STAGE_4_FULL_TASK
    }
  ];

  // Define all configurable rewards with metadata
  // Note: min/max are removed - you can set any value you want!
  rewardConfigs: RewardConfigItem[] = [
    // Progression Rewards
    { key: 'grab_orb_reward', label: 'Grab Orb', description: 'Reward for picking up an orb', min: -Infinity, max: Infinity, step: 0.1, category: 'progression' },
    { key: 'leave_excavation_with_orbs_reward', label: 'Leave Excavation', description: 'Bonus for leaving excavation with orbs', min: -Infinity, max: Infinity, step: 0.1, category: 'progression' },
    { key: 'enter_construction_with_orbs_reward', label: 'Enter Construction', description: 'Bonus for reaching construction with orbs', min: -Infinity, max: Infinity, step: 0.1, category: 'progression' },
    { key: 'deposit_berm_reward', label: 'Deposit Berm', description: 'MASSIVE reward for berm deposit', min: -Infinity, max: Infinity, step: 1, category: 'progression' },
    { key: 'deposit_construction_reward', label: 'Deposit Construction', description: 'HUGE reward for construction deposit', min: -Infinity, max: Infinity, step: 1, category: 'progression' },
    { key: 'return_to_excavation_reward', label: 'Return to Excavation', description: 'Reward for cycling back', min: -Infinity, max: Infinity, step: 0.1, category: 'progression' },

    // Per-Step Holding Rewards
    { key: 'holding_orbs_in_excavation_reward', label: 'Holding in Excavation', description: 'Per-step reward while holding in excavation', min: -Infinity, max: Infinity, step: 0.01, category: 'holding' },
    { key: 'holding_orbs_in_obstacle_reward', label: 'Holding in Obstacle', description: 'Per-step reward while transporting through obstacles', min: -Infinity, max: Infinity, step: 0.01, category: 'holding' },
    { key: 'holding_orbs_in_construction_reward', label: 'Holding in Construction', description: 'Per-step reward while in construction zone', min: -Infinity, max: Infinity, step: 0.01, category: 'holding' },

    // Penalties
    { key: 'step_penalty', label: 'Step Penalty', description: 'Per-step time penalty', min: -Infinity, max: Infinity, step: 0.001, category: 'penalties' },
    { key: 'collision_penalty', label: 'Collision', description: 'Penalty for hitting obstacles', min: -Infinity, max: Infinity, step: 1, category: 'penalties' },
    { key: 'drop_excavation_penalty', label: 'Drop in Excavation', description: 'Penalty for dropping where you dig', min: -Infinity, max: Infinity, step: 1, category: 'penalties' },
    { key: 'drop_obstacle_penalty', label: 'Drop in Obstacle', description: 'SEVERE penalty, ends episode', min: -Infinity, max: Infinity, step: 1, category: 'penalties' },
    { key: 'idle_penalty', label: 'Idle Penalty', description: 'Penalty for not moving', min: -Infinity, max: Infinity, step: 0.01, category: 'penalties' },
    { key: 'backward_movement_penalty', label: 'Backward Movement', description: 'Penalty for driving backward', min: -Infinity, max: Infinity, step: 0.01, category: 'penalties' },
    { key: 'holding_orbs_outside_construction_penalty', label: 'Holding Outside Construction', description: 'Per-step penalty for wasting time with orbs', min: -Infinity, max: Infinity, step: 0.01, category: 'penalties' },

    // Movement Rewards
    { key: 'forward_movement_reward', label: 'Forward Movement', description: 'Reward for driving forward', min: -Infinity, max: Infinity, step: 0.01, category: 'movement' },
    { key: 'maintaining_speed_reward', label: 'Maintaining Speed', description: 'Reward for smooth throttle control', min: -Infinity, max: Infinity, step: 0.01, category: 'movement' },
    { key: 'high_speed_reward', label: 'High Speed', description: 'Reward for driving fast when safe', min: -Infinity, max: Infinity, step: 0.01, category: 'movement' },
    { key: 'maintaining_heading_reward', label: 'Maintaining Heading', description: 'Reward for straight-line driving', min: -Infinity, max: Infinity, step: 0.01, category: 'movement' },
    { key: 'smooth_acceleration_reward', label: 'Smooth Acceleration', description: 'Reward for smooth speed changes', min: -Infinity, max: Infinity, step: 0.01, category: 'movement' },
    { key: 'smooth_turning_reward', label: 'Smooth Turning', description: 'Reward for smooth heading changes', min: -Infinity, max: Infinity, step: 0.01, category: 'movement' },
  ];

  categories = [
    { id: 'progression', label: 'Progression Rewards', description: 'Main task completion rewards' },
    { id: 'holding', label: 'Holding Rewards', description: 'Per-step rewards while carrying orbs' },
    { id: 'penalties', label: 'Penalties', description: 'Negative rewards for bad behaviors' },
    { id: 'movement', label: 'Movement Rewards', description: 'Rewards for efficient movement' },
  ];

  ngOnInit() {
    this.loadConfig();
  }

  loadConfig() {
    // Try to load from localStorage first
    const savedConfig = localStorage.getItem('ml_reward_config');
    const savedPreset = localStorage.getItem('ml_training_preset');

    if (savedPreset) {
      this.selectedPreset = savedPreset;
    }

    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        // Merge with defaults to ensure we have all required values
        this.config = { ...DEFAULT_ML_CONFIG, ...parsed };
        console.log('[Rewards Panel] Loaded config from localStorage');
      } catch (e) {
        console.error('[Rewards Panel] Failed to parse saved config, using defaults');
        this.config = { ...DEFAULT_ML_CONFIG };
      }
    } else {
      // Use default config
      this.config = { ...DEFAULT_ML_CONFIG };
    }

    console.log('[Rewards Panel] Initial config loaded:', this.config);

    // Apply to environment
    this.applyConfig();
  }

  saveConfig() {
    // Save to localStorage
    localStorage.setItem('ml_reward_config', JSON.stringify(this.config));
    console.log('[Rewards Panel] Config saved to localStorage');

    // Apply to environment
    this.applyConfig();
  }

  applyConfig() {
    // Only send defined values to avoid overwriting config with undefined
    const definedConfig: Partial<MLConfig> = {};
    for (const key in this.config) {
      if (this.config[key as keyof MLConfig] !== undefined) {
        (definedConfig as any)[key] = this.config[key as keyof MLConfig];
      }
    }
    this.mlEnvironment.setConfig(definedConfig);
    console.log('[Rewards Panel] Config applied to environment', definedConfig);
  }

  resetAll() {
    if (confirm('Reset all rewards to default values?')) {
      this.config = { ...DEFAULT_ML_CONFIG };
      this.saveConfig();
    }
  }

  resetReward(key: keyof MLConfig) {
    this.config = { ...this.config, [key]: DEFAULT_ML_CONFIG[key] };
    this.saveConfig();
  }

  toggleCategory(categoryId: string) {
    if (this.expandedCategories.has(categoryId)) {
      this.expandedCategories.delete(categoryId);
    } else {
      this.expandedCategories.add(categoryId);
    }
  }

  isCategoryExpanded(categoryId: string): boolean {
    return this.expandedCategories.has(categoryId);
  }

  getRewardsForCategory(categoryId: string): RewardConfigItem[] {
    return this.rewardConfigs.filter(r => r.category === categoryId);
  }

  getValue(key: keyof MLConfig): number {
    return this.config[key] as number ?? DEFAULT_ML_CONFIG[key] as number;
  }

  setValue(key: keyof MLConfig, value: number) {
    this.config[key] = value as any;
  }

  onInputChange(key: keyof MLConfig, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = parseFloat(input.value);

    // Validate the value
    if (isNaN(value) || !isFinite(value)) {
      // Invalid value - reset to default
      console.warn(`[Rewards Panel] Invalid value for ${key}, resetting to default`);
      const defaultValue = DEFAULT_ML_CONFIG[key] as number;
      input.value = defaultValue.toString();
      this.setValue(key, defaultValue);
      this.saveConfig();
      return;
    }

    // Mark as custom when manually editing
    this.selectedPreset = 'custom';
    localStorage.setItem('ml_training_preset', 'custom');

    // No clamping - you can set any value you want!
    this.setValue(key, value);
    this.saveConfig();
  }

  exportConfig() {
    const dataStr = JSON.stringify(this.config, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = 'ml_reward_config.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  importConfig(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target?.result as string);
        this.config = config;
        this.selectedPreset = 'custom';
        this.saveConfig();
        console.log('[Rewards Panel] Config imported successfully');
      } catch (error) {
        console.error('[Rewards Panel] Failed to import config:', error);
        alert('Failed to import config file');
      }
    };

    reader.readAsText(file);
  }

  onPresetChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const presetId = select.value;

    if (presetId === 'custom') {
      // Keep current config
      return;
    }

    const preset = this.presets.find(p => p.id === presetId);
    if (!preset) return;

    if (confirm(`Load "${preset.name}" preset? This will replace your current configuration.\n\n${preset.description}`)) {
      this.selectedPreset = presetId;
      this.config = { ...preset.config };
      localStorage.setItem('ml_training_preset', presetId);
      this.saveConfig();
      console.log(`[Rewards Panel] Loaded preset: ${preset.name}`);
    } else {
      // User cancelled - revert dropdown
      select.value = this.selectedPreset;
    }
  }

  getPresetDescription(): string {
    const preset = this.presets.find(p => p.id === this.selectedPreset);
    return preset ? preset.description : '';
  }
}
