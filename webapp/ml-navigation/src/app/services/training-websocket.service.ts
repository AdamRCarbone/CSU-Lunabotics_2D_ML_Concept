import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';

export interface TrainingMetrics {
  episode: number;
  step: number;
  episode_reward: number;
  avg_reward_100: number;
  episode_length: number;
  loss: number;
  learning_rate: number;
  exploration_rate: number;
  orbs_collected: number;
  orbs_deposited: number;
  success_rate: number;
  steps_per_sec: number;
  timestamp: number;
}

export interface TrainingConfig {
  environment: any;
  training: any;
  rewards: any;
  server: any;
  seed: number;
}

@Injectable({
  providedIn: 'root'
})
export class TrainingWebsocketService {
  private socket: Socket;
  private serverUrl = 'http://localhost:5000';

  // Observables for real-time data
  private metricsSubject = new Subject<TrainingMetrics>();
  private configSubject = new Subject<TrainingConfig>();
  private statusSubject = new Subject<boolean>();
  private historySubject = new Subject<TrainingMetrics[]>();

  public metrics$ = this.metricsSubject.asObservable();
  public config$ = this.configSubject.asObservable();
  public trainingStatus$ = this.statusSubject.asObservable();
  public history$ = this.historySubject.asObservable();

  private isConnected = false;

  constructor() {
    this.socket = io(this.serverUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to training server');
      this.isConnected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from training server');
      this.isConnected = false;
    });

    this.socket.on('metrics_update', (data: TrainingMetrics) => {
      this.metricsSubject.next(data);
    });

    this.socket.on('current_metrics', (data: TrainingMetrics) => {
      this.metricsSubject.next(data);
    });

    this.socket.on('training_config', (data: TrainingConfig) => {
      this.configSubject.next(data);
    });

    this.socket.on('config_updated', (data: TrainingConfig) => {
      this.configSubject.next(data);
    });

    this.socket.on('training_status', (data: { is_training: boolean }) => {
      this.statusSubject.next(data.is_training);
    });

    this.socket.on('training_started', () => {
      this.statusSubject.next(true);
    });

    this.socket.on('training_stopped', () => {
      this.statusSubject.next(false);
    });

    this.socket.on('history_data', (data: { history: TrainingMetrics[] }) => {
      this.historySubject.next(data.history);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });
  }

  connect() {
    if (!this.isConnected) {
      this.socket.connect();
    }
  }

  disconnect() {
    if (this.isConnected) {
      this.socket.disconnect();
    }
  }

  requestHistory(limit: number = 1000) {
    this.socket.emit('request_history', { limit });
  }

  // HTTP API calls (using fetch)
  async getMetrics(): Promise<TrainingMetrics> {
    const response = await fetch(`${this.serverUrl}/metrics`);
    return response.json();
  }

  async getConfig(): Promise<TrainingConfig> {
    const response = await fetch(`${this.serverUrl}/config`);
    return response.json();
  }

  async updateConfig(config: Partial<TrainingConfig>): Promise<void> {
    await fetch(`${this.serverUrl}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
  }

  async startTraining(): Promise<void> {
    await fetch(`${this.serverUrl}/control/start`, { method: 'POST' });
  }

  async stopTraining(): Promise<void> {
    await fetch(`${this.serverUrl}/control/stop`, { method: 'POST' });
  }

  async saveModel(): Promise<void> {
    await fetch(`${this.serverUrl}/control/save`, { method: 'POST' });
  }

  async getHealth(): Promise<{ status: string; is_training: boolean }> {
    const response = await fetch(`${this.serverUrl}/health`);
    return response.json();
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}
