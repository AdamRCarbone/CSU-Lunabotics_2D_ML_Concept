import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParameterDisplay } from './parameter-display';

describe('ParameterDisplay', () => {
  let component: ParameterDisplay;
  let fixture: ComponentFixture<ParameterDisplay>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParameterDisplay]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParameterDisplay);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
