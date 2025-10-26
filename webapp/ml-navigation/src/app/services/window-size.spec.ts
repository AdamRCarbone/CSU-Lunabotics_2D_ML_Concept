import { TestBed } from '@angular/core/testing';

import { WindowSize } from './window-size';

describe('WindowSize', () => {
  let service: WindowSize;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WindowSize);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
