import { TestBed } from '@angular/core/testing';

import { ResetTrigger } from './reset-trigger';

describe('ResetTrigger', () => {
  let service: ResetTrigger;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ResetTrigger);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
