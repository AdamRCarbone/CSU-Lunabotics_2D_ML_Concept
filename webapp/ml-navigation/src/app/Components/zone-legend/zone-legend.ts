import { Component } from '@angular/core';

export interface ZoneInfo {
  name: string;
  color: string;
  description?: string;
}

// Single source of truth for zone colors and information
export const ZONE_COLORS = {
  startingZone: '#69D140',
  excavationZone: '#4099d1',
  obstacleZone: '#ffcb5c',
  constructionZone: '#ffa43d',
  targetBermZone: '#ff3609',
  columnPostZone: '#ff0000'
} as const;

export const ZONE_INFO: ZoneInfo[] = [
  {
    name: 'Starting Zone',
    color: ZONE_COLORS.startingZone,
    description: '2m × 2m'
  },
  {
    name: 'Excavation Zone',
    color: ZONE_COLORS.excavationZone,
    description: '2.5m wide'
  },
  {
    name: 'Obstacle Zone',
    color: ZONE_COLORS.obstacleZone,
    description: '4.38m wide'
  },
  {
    name: 'Construction Zone',
    color: ZONE_COLORS.constructionZone,
    description: '3m × 1.5m'
  },
  {
    name: 'Target Berm',
    color: ZONE_COLORS.targetBermZone,
    description: '1.7m × 0.8m'
  }
];

@Component({
  selector: 'app-zone-legend',
  imports: [],
  templateUrl: './zone-legend.html',
  styleUrl: './zone-legend.css',
})
export class ZoneLegend {
  zones = ZONE_INFO;
}
