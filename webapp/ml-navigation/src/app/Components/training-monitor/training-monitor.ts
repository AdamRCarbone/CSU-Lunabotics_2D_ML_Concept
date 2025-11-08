import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, ChartConfiguration, ChartData, registerables } from 'chart.js';
import { TrainingWebsocketService, TrainingMetrics, TrainingConfig } from '../../services/training-websocket.service';
import { Subscription } from 'rxjs';

// Register Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-training-monitor',
  imports: [CommonModule, FormsModule],
  templateUrl: './training-monitor.html',
  styleUrl: './training-monitor.css',
})
export class TrainingMonitor implements OnInit, OnDestroy {
  // Connection status
  isConnected = false;
  isTraining = false;

  // Current metrics
  currentMetrics: TrainingMetrics | null = null;
  config: TrainingConfig | null = null;

  // Historical data for charts
  episodeHistory: number[] = [];
  rewardHistory: number[] = [];
  avgRewardHistory: number[] = [];
  lossHistory: number[] = [];
  successRateHistory: number[] = [];
  lengthHistory: number[] = [];

  maxHistoryPoints = 500; // Keep last 500 episodes on chart

  // Charts
  rewardChart: Chart | null = null;
  lossChart: Chart | null = null;
  successChart: Chart | null = null;

  // Subscriptions
  private subscriptions: Subscription[] = [];

  // Configuration editing
  isEditingConfig = false;
  editableConfig: any = {};

  constructor(private wsService: TrainingWebsocketService) {}

  ngOnInit() {
    // Connect to WebSocket
    this.wsService.connect();

    // Subscribe to metrics updates
    this.subscriptions.push(
      this.wsService.metrics$.subscribe(metrics => {
        this.handleMetricsUpdate(metrics);
      })
    );

    // Subscribe to config updates
    this.subscriptions.push(
      this.wsService.config$.subscribe(config => {
        this.config = config;
        this.editableConfig = JSON.parse(JSON.stringify(config));
      })
    );

    // Subscribe to training status
    this.subscriptions.push(
      this.wsService.trainingStatus$.subscribe(isTraining => {
        this.isTraining = isTraining;
      })
    );

    // Subscribe to history
    this.subscriptions.push(
      this.wsService.history$.subscribe(history => {
        this.loadHistory(history);
      })
    );

    // Check connection status periodically
    setInterval(() => {
      this.isConnected = this.wsService.getConnectionStatus();
    }, 1000);

    // Initialize charts after a short delay
    setTimeout(() => {
      this.initializeCharts();
    }, 100);

    // Request historical data
    this.wsService.requestHistory(this.maxHistoryPoints);
  }

  ngOnDestroy() {
    // Cleanup subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());

    // Destroy charts
    this.rewardChart?.destroy();
    this.lossChart?.destroy();
    this.successChart?.destroy();

    // Disconnect WebSocket
    this.wsService.disconnect();
  }

  private handleMetricsUpdate(metrics: TrainingMetrics) {
    this.currentMetrics = metrics;

    // Add to history
    this.episodeHistory.push(metrics.episode);
    this.rewardHistory.push(metrics.episode_reward);
    this.avgRewardHistory.push(metrics.avg_reward_100);
    this.lossHistory.push(metrics.loss);
    this.successRateHistory.push(metrics.success_rate * 100);
    this.lengthHistory.push(metrics.episode_length);

    // Trim history if too long
    if (this.episodeHistory.length > this.maxHistoryPoints) {
      this.episodeHistory = this.episodeHistory.slice(-this.maxHistoryPoints);
      this.rewardHistory = this.rewardHistory.slice(-this.maxHistoryPoints);
      this.avgRewardHistory = this.avgRewardHistory.slice(-this.maxHistoryPoints);
      this.lossHistory = this.lossHistory.slice(-this.maxHistoryPoints);
      this.successRateHistory = this.successRateHistory.slice(-this.maxHistoryPoints);
      this.lengthHistory = this.lengthHistory.slice(-this.maxHistoryPoints);
    }

    // Update charts
    this.updateCharts();
  }

  private loadHistory(history: TrainingMetrics[]) {
    // Clear existing data
    this.episodeHistory = [];
    this.rewardHistory = [];
    this.avgRewardHistory = [];
    this.lossHistory = [];
    this.successRateHistory = [];
    this.lengthHistory = [];

    // Load from history
    history.forEach(metrics => {
      this.episodeHistory.push(metrics.episode);
      this.rewardHistory.push(metrics.episode_reward);
      this.avgRewardHistory.push(metrics.avg_reward_100);
      this.lossHistory.push(metrics.loss);
      this.successRateHistory.push(metrics.success_rate * 100);
      this.lengthHistory.push(metrics.episode_length);
    });

    // Update charts
    this.updateCharts();
  }

  private initializeCharts() {
    // Reward chart
    const rewardCanvas = document.getElementById('rewardChart') as HTMLCanvasElement;
    if (rewardCanvas) {
      this.rewardChart = new Chart(rewardCanvas, {
        type: 'line',
        data: {
          labels: this.episodeHistory,
          datasets: [
            {
              label: 'Episode Reward',
              data: this.rewardHistory,
              borderColor: 'rgba(75, 192, 192, 1)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              borderWidth: 1,
              pointRadius: 0,
              tension: 0.1
            },
            {
              label: 'Avg Reward (100 ep)',
              data: this.avgRewardHistory,
              borderColor: 'rgba(255, 99, 132, 1)',
              backgroundColor: 'rgba(255, 99, 132, 0.2)',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { title: { display: true, text: 'Episode' } },
            y: { title: { display: true, text: 'Reward' } }
          },
          animation: { duration: 0 }
        }
      });
    }

    // Loss chart
    const lossCanvas = document.getElementById('lossChart') as HTMLCanvasElement;
    if (lossCanvas) {
      this.lossChart = new Chart(lossCanvas, {
        type: 'line',
        data: {
          labels: this.episodeHistory,
          datasets: [
            {
              label: 'Training Loss',
              data: this.lossHistory,
              borderColor: 'rgba(153, 102, 255, 1)',
              backgroundColor: 'rgba(153, 102, 255, 0.2)',
              borderWidth: 1,
              pointRadius: 0,
              tension: 0.1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { title: { display: true, text: 'Episode' } },
            y: { title: { display: true, text: 'Loss' } }
          },
          animation: { duration: 0 }
        }
      });
    }

    // Success rate chart
    const successCanvas = document.getElementById('successChart') as HTMLCanvasElement;
    if (successCanvas) {
      this.successChart = new Chart(successCanvas, {
        type: 'line',
        data: {
          labels: this.episodeHistory,
          datasets: [
            {
              label: 'Success Rate (%)',
              data: this.successRateHistory,
              borderColor: 'rgba(255, 206, 86, 1)',
              backgroundColor: 'rgba(255, 206, 86, 0.2)',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.1,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { title: { display: true, text: 'Episode' } },
            y: {
              title: { display: true, text: 'Success Rate (%)' },
              min: 0,
              max: 100
            }
          },
          animation: { duration: 0 }
        }
      });
    }
  }

  private updateCharts() {
    if (this.rewardChart) {
      this.rewardChart.data.labels = this.episodeHistory;
      this.rewardChart.data.datasets[0].data = this.rewardHistory;
      this.rewardChart.data.datasets[1].data = this.avgRewardHistory;
      this.rewardChart.update('none');
    }

    if (this.lossChart) {
      this.lossChart.data.labels = this.episodeHistory;
      this.lossChart.data.datasets[0].data = this.lossHistory;
      this.lossChart.update('none');
    }

    if (this.successChart) {
      this.successChart.data.labels = this.episodeHistory;
      this.successChart.data.datasets[0].data = this.successRateHistory;
      this.successChart.update('none');
    }
  }

  // Control methods
  async startTraining() {
    await this.wsService.startTraining();
  }

  async stopTraining() {
    await this.wsService.stopTraining();
  }

  async saveModel() {
    await this.wsService.saveModel();
  }

  toggleConfigEdit() {
    this.isEditingConfig = !this.isEditingConfig;
    if (!this.isEditingConfig && this.config) {
      // Reset editable config
      this.editableConfig = JSON.parse(JSON.stringify(this.config));
    }
  }

  async saveConfig() {
    await this.wsService.updateConfig(this.editableConfig);
    this.isEditingConfig = false;
  }

  // Helper methods
  formatNumber(num: number | undefined, decimals: number = 2): string {
    if (num === undefined || num === null) return '0';
    return num.toFixed(decimals);
  }

  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  }

  getStatusColor(): string {
    if (!this.isConnected) return '#e74c3c'; // Red
    if (this.isTraining) return '#27ae60'; // Green
    return '#f39c12'; // Orange
  }

  getStatusText(): string {
    if (!this.isConnected) return 'Disconnected';
    if (this.isTraining) return 'Training';
    return 'Idle';
  }
}
