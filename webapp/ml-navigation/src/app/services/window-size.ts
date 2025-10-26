// src/app/services/window-size.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WindowSizeService {
  public windowSizeSubject = new BehaviorSubject<{ width: number; height: number }>({
    width: window.innerWidth,
    height: window.innerHeight
  });

  windowSize$ = this.windowSizeSubject.asObservable();

  updateWindowSize(width: number, height: number) {
    this.windowSizeSubject.next({ width, height });
  }
}