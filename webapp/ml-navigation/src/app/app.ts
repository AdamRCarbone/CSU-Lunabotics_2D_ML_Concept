// src/app/app.component.ts
import { Component, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EnvironmentComponent } from '../environment/environment';
import { WindowSizeService } from './services/window-size';
import { UniversalSliderComponent } from './Components/universal_slider/universal-slider';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, EnvironmentComponent, UniversalSliderComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App {
  title = 'ml-navigation';
  public window_width = window.innerWidth;
  public window_height = window.innerHeight;
  public grid_size = 100;
  public cell_size = this.window_height / this.grid_size;
  public sliderValue: number = 0;

  constructor(private windowSizeService: WindowSizeService) {
    // Initial broadcast of window size
    this.windowSizeService.updateWindowSize(this.window_width, this.window_height);
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event) {
    this.window_width = window.innerWidth;
    this.window_height = window.innerHeight;
    this.cell_size = this.window_height / this.grid_size;
    this.windowSizeService.updateWindowSize(this.window_width, this.window_height);
  }
}