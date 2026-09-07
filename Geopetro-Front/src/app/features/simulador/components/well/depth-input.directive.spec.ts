import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DepthUnit } from '../../models/depth-unit';
import { DepthInputDirective } from './depth-input.directive';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, DepthInputDirective],
  template: '<input type="number" [formControl]="control" [appDepthInput]="unit">',
})
class Host {
  unit: DepthUnit = 'm';
  control = new FormControl<number | string | null>(304.8);
}

afterEach(() => TestBed.resetTestingModule());

describe('depth input boundary', () => {
  function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    const unit = (value: DepthUnit) => {
      host.unit = value;
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
    };
    const edit = (value: string) => { input.value = value; input.dispatchEvent(new Event('input')); };
    return { fixture, host, input, unit, edit };
  }

  it('switches repeatedly without emitting, rounding stored metres or dirtying the form', () => {
    const { host, input, unit } = setup();
    const changed = vi.fn();
    host.control.valueChanges.subscribe(changed);
    expect(input.valueAsNumber).toBe(304.8);
    unit('ft');
    expect(input.valueAsNumber).toBe(1000);
    for (let i = 0; i < 20; i++) { unit('m'); unit('ft'); }
    expect(host.control.value).toBe(304.8);
    expect(host.control.pristine).toBe(true);
    expect(changed).not.toHaveBeenCalled();
  });

  it('converts edits to canonical metres and preserves the distinction between empty and zero', () => {
    const { host, input, unit, edit } = setup();
    unit('ft');
    edit('1200');
    expect(host.control.value).toBeCloseTo(365.76, 10);
    expect(host.control.dirty).toBe(true);
    unit('m');
    expect(input.valueAsNumber).toBeCloseTo(365.76, 10);
    edit('');
    expect(host.control.value).toBeNull();
    unit('ft');
    expect(input.value).toBe('');
    edit('0');
    expect(host.control.value).toBe(0);
    input.dispatchEvent(new Event('blur'));
    expect(host.control.touched).toBe(true);
    host.control.disable();
    expect(input.disabled).toBe(true);
  });

  it('displays restored numeric strings as metres and keeps full input precision', () => {
    const { host, input, unit } = setup();
    unit('ft');
    host.control.setValue('304.8');
    expect(input.valueAsNumber).toBe(1000);
    host.control.setValue(1.23456789);
    unit('m');
    expect(input.valueAsNumber).toBe(1.23456789);
    host.control.setValue(NaN);
    expect(input.value).toBe('');
    host.control.setValue(' ');
    expect(input.value).toBe('');
  });
});
