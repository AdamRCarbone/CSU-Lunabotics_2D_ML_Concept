import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ResetTrigger {
  public resetSubject = new Subject<void>();
  reset$ = this.resetSubject.asObservable();

  triggerReset() {
    this.resetSubject.next();
  }
}
