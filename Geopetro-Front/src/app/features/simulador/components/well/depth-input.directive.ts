import { Directive, ElementRef, forwardRef, HostListener, Input, OnChanges, Renderer2 } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DepthUnit, depthFromMetres, depthToMetres } from '../../models/depth-unit';

/** O controle sempre contém metros; a unidade só pertence à apresentação. */
@Directive({
  selector: 'input[appDepthInput]',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DepthInputDirective), multi: true }],
})
export class DepthInputDirective implements ControlValueAccessor, OnChanges {
  @Input() appDepthInput: DepthUnit = 'm';
  private metres: number | null = null;
  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private element: ElementRef<HTMLInputElement>, private renderer: Renderer2) {}

  writeValue(value: number | string | null): void {
    this.metres = value == null || (typeof value === 'string' && !value.trim()) ? null : Number(value);
    this.render();
  }
  registerOnChange(fn: (value: number | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.renderer.setProperty(this.element.nativeElement, 'disabled', disabled); }
  ngOnChanges(): void { this.render(); }

  @HostListener('input')
  input(): void {
    const input = this.element.nativeElement;
    this.metres = input.value === '' || !Number.isFinite(input.valueAsNumber)
      ? null : depthToMetres(input.valueAsNumber, this.appDepthInput);
    this.onChange(this.metres);
  }

  @HostListener('blur')
  blur(): void { this.onTouched(); }

  private render(): void {
    const value = this.metres == null || !Number.isFinite(this.metres)
      ? '' : depthFromMetres(this.metres, this.appDepthInput);
    this.renderer.setProperty(this.element.nativeElement, 'value', value);
  }
}
