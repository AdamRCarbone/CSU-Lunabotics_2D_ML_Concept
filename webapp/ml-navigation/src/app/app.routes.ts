import { Routes } from '@angular/router';
import { TrainingMonitor } from './Components/training-monitor/training-monitor';

export const routes: Routes = [
  { path: 'training', component: TrainingMonitor },
  { path: '', redirectTo: '/training', pathMatch: 'full' }
];
