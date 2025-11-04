import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Frustum } from './frustum';

describe('Frustum', () => {
  let component: Frustum;
  let fixture: ComponentFixture<Frustum>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Frustum]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Frustum);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
