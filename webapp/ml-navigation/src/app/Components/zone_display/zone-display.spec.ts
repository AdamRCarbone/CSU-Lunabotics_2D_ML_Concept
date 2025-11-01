import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ZoneDisplay } from './zone-display';

describe('ZoneDisplay', () => {
  let component: ZoneDisplay;
  let fixture: ComponentFixture<ZoneDisplay>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZoneDisplay]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ZoneDisplay);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
