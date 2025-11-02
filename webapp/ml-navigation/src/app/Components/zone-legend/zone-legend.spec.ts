import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ZoneLegend } from './zone-legend';

describe('ZoneLegend', () => {
  let component: ZoneLegend;
  let fixture: ComponentFixture<ZoneLegend>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZoneLegend]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ZoneLegend);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
