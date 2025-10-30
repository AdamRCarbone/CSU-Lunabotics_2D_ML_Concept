import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PositionDisplay } from './position-display';

describe('PositionDisplay', () => {
  let component: PositionDisplay;
  let fixture: ComponentFixture<PositionDisplay>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PositionDisplay]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PositionDisplay);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
