import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EnvironmentComponent } from '../environment/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, EnvironmentComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
  
})
export class App {
  title = 'ml-navigation';

  public window_width = window.innerWidth;
  public window_height = window.innerHeight;
  public grid_size = 100;
  public cell_size = this.window_height/this.grid_size
}
