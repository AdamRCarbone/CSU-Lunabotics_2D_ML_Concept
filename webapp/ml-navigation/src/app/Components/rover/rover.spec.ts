import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Rover } from './rover';

describe('Rover', () => {
  let component: Rover;
  let fixture: ComponentFixture<Rover>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Rover]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Rover);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
