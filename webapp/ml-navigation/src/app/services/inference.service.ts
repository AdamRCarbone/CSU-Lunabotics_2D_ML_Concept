import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';

export interface ModelInfo {
  name: string;
  path: string;
  size: number;
}

@Injectable({
  providedIn: 'root'
})
export class InferenceService {
  private serverUrl = 'http://localhost:5001';
  private socket: Socket;

  private modelLoadedSubject = new Subject<boolean>();
  public modelLoaded$ = this.modelLoadedSubject.asObservable();

  constructor() {
    this.socket = io(this.serverUrl, {
      autoConnect: false,
      reconnection: true
    });

    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to inference server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from inference server');
    });

    this.socket.on('server_status', (data: any) => {
      this.modelLoadedSubject.next(data.model_loaded);
    });
  }

  connect() {
    this.socket.connect();
  }

  disconnect() {
    this.socket.disconnect();
  }

  async getHealth(): Promise<any> {
    const response = await fetch(`${this.serverUrl}/health`);
    return response.json();
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await fetch(`${this.serverUrl}/models`);
    const data = await response.json();
    return data.models;
  }

  async loadModel(modelPath: string): Promise<any> {
    const response = await fetch(`${this.serverUrl}/load_model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_path: modelPath })
    });
    return response.json();
  }

  async predict(observation: number[]): Promise<number[]> {
    const response = await fetch(`${this.serverUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observation })
    });
    const data = await response.json();
    return data.action;
  }
}
