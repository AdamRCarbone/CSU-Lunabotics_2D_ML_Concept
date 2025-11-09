import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ObstacleField } from './obstacle-field';

describe('ObstacleField', () => {
  let component: ObstacleField;
  let fixture: ComponentFixture<ObstacleField>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ObstacleField]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ObstacleField);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
