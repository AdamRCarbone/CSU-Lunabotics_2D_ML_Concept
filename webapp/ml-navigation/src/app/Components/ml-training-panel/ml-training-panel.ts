// ML Training Control Panel Component

import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MLBridgeService } from '../../services/ml-bridge';
import { MLEnvironmentService } from '../../services/ml-environment';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-ml-training-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ml-training-panel.html',
  styleUrl: './ml-training-panel.css'
})
export class MLTrainingPanel implements OnInit, OnDestroy {
  private mlBridge = inject(MLBridgeService);
  private mlEnvironment = inject(MLEnvironmentService);

  // Connection status
  connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  isTraining: boolean = false;

  // Parallel training info
  isParallelTraining: boolean = false;
  parallelEnvCount: number = 1;

  // Episode statistics
  episodeCount: number = 0;
  currentEpisodeSteps: number = 0;
  lastEpisodeReward: number = 0;
  lastEpisodeOrbsCollected: number = 0;
  averageReward: number = 0;
  successRate: number = 0;

  // Recent episodes (for chart/display)
  recentEpisodes: Array<{
    episode: number;
    reward: number;
    orbs: number;
    steps: number;
  }> = [];

  private connectionSub?: Subscription;
  private trainingSub?: Subscription;
  private episodeStatsSub?: Subscription;
  private checkpointInfoSub?: Subscription;
  private parallelTrainingInfoSub?: Subscription;

  // Configuration
  maxEpisodeSteps: number = 1000;
  showAdvancedSettings: boolean = false;

  // Checkpoint information
  checkpointName: string | null = null;
  checkpointSteps: number | null = null;

  ngOnInit() {
    // Subscribe to connection status
    this.connectionSub = this.mlBridge.connectionStatus$.subscribe(status => {
      this.connectionStatus = status;
    });

    // Subscribe to training status
    this.trainingSub = this.mlBridge.trainingStatus$.subscribe(isTraining => {
      this.isTraining = isTraining;
    });

    // Subscribe to episode stats
    this.episodeStatsSub = this.mlBridge.episodeStats$.subscribe(stats => {
      this.handleEpisodeComplete(stats);
    });

    // Subscribe to checkpoint info
    this.checkpointInfoSub = this.mlBridge.checkpointInfo$.subscribe(info => {
      if (info) {
        this.checkpointName = info.name;
        this.checkpointSteps = info.steps;
      }
    });

    // Subscribe to parallel training info
    this.parallelTrainingInfoSub = this.mlBridge.parallelTrainingInfo$.subscribe(info => {
      if (info) {
        this.isParallelTraining = info.envCount > 1;
        this.parallelEnvCount = info.envCount;
      }
    });
  }

  ngOnDestroy() {
    this.connectionSub?.unsubscribe();
    this.trainingSub?.unsubscribe();
    this.episodeStatsSub?.unsubscribe();
    this.checkpointInfoSub?.unsubscribe();
    this.parallelTrainingInfoSub?.unsubscribe();
  }

  // ==================== Actions ====================

  connect() {
    this.mlBridge.connect();
  }

  disconnect() {
    this.mlBridge.disconnect();
  }

  startTraining() {
    this.mlBridge.startTraining();
  }

  stopTraining() {
    this.mlBridge.stopTraining();
  }

  resetStats() {
    this.episodeCount = 0;
    this.currentEpisodeSteps = 0;
    this.lastEpisodeReward = 0;
    this.lastEpisodeOrbsCollected = 0;
    this.averageReward = 0;
    this.successRate = 0;
    this.recentEpisodes = [];
  }

  applyConfiguration() {
    this.mlEnvironment.setConfig({
      max_episode_steps: this.maxEpisodeSteps
    });
    console.log('Configuration applied:', { max_episode_steps: this.maxEpisodeSteps });
  }

  // ==================== Stats Handling ====================

  private handleEpisodeComplete(stats: any) {
    this.episodeCount++;
    this.lastEpisodeReward = stats.total_reward || 0;
    this.lastEpisodeOrbsCollected = stats.orbs_collected || 0;
    this.currentEpisodeSteps = stats.episode_length || 0;

    // Add to recent episodes
    this.recentEpisodes.push({
      episode: this.episodeCount,
      reward: this.lastEpisodeReward,
      orbs: this.lastEpisodeOrbsCollected,
      steps: this.currentEpisodeSteps
    });

    // Keep only last 10 episodes
    if (this.recentEpisodes.length > 10) {
      this.recentEpisodes.shift();
    }

    // Calculate averages
    this.averageReward = this.recentEpisodes.reduce((sum, ep) => sum + ep.reward, 0) / this.recentEpisodes.length;

    // Calculate success rate (episodes with orbs collected)
    const successfulEpisodes = this.recentEpisodes.filter(ep => ep.orbs > 0).length;
    this.successRate = (successfulEpisodes / this.recentEpisodes.length) * 100;
  }

  // ==================== Helpers ====================

  getConnectionStatusColor(): string {
    switch (this.connectionStatus) {
      case 'connected': return '#4caf50';
      case 'connecting': return '#ff9800';
      case 'disconnected': return '#f44336';
    }
  }

  getConnectionStatusText(): string {
    switch (this.connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Disconnected';
    }
  }

  getWebSocketUrl(): string {
    const urlParams = new URLSearchParams(window.location.search);
    const wsPort = urlParams.get('wsPort');
    if (wsPort) {
      return `Connect to ws://localhost:${wsPort}`;
    }
    return 'Connect to ws://localhost:8765';
  }
}
