import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DiggingField } from './digging-field';

describe('DiggingField', () => {
  let component: DiggingField;
  let fixture: ComponentFixture<DiggingField>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiggingField]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DiggingField);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
