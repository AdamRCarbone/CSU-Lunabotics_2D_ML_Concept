import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UniversalSliderComponent } from './universal-slider';
import { By } from '@angular/platform-browser';

describe('UniversalSliderComponent', () => {
  let component: UniversalSliderComponent;
  let fixture: ComponentFixture<UniversalSliderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [UniversalSliderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(UniversalSliderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default values', () => {
    expect(component.value).toBe(0);
    expect(component.min).toBe(0);
    expect(component.max).toBe(100);
    expect(component.step).toBe(1);
    expect(component.orientation).toBe('horizontal');
  });

  it('should apply vertical class when orientation is vertical', () => {
    component.orientation = 'vertical';
    fixture.detectChanges();
    const input = fixture.debugElement.query(By.css('input')).nativeElement;
    expect(input.classList.contains('vertical')).toBeTrue();
    expect(input.classList.contains('horizontal')).toBeFalse();
  });

  it('should emit valueChange on input', () => {
    spyOn(component.valueChange, 'emit');
    const input = fixture.debugElement.query(By.css('input')).nativeElement;
    input.value = 50;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.valueChange.emit).toHaveBeenCalledWith(50);
    expect(component.value).toBe(50);
  });

  it('should bind min, max, and step inputs', () => {
    component.min = 10;
    component.max = 90;
    component.step = 5;
    fixture.detectChanges();
    const input = fixture.debugElement.query(By.css('input')).nativeElement;
    expect(input.getAttribute('min')).toBe('10');
    expect(input.getAttribute('max')).toBe('90');
    expect(input.getAttribute('step')).toBe('5');
  });
});