import { TestBed } from '@angular/core/testing';
import { FormArray, FormBuilder } from '@angular/forms';
import { afterEach, expect, it } from 'vitest';
import { WellStructureFormComponent } from './well-structure-form.component';
import { buildWellGeometry, emptyPhaseForm } from '../../models/well-geometry.form';

afterEach(() => TestBed.resetTestingModule());

it('converts phase and shoe controls and derived TVDs, leaving diameters and manual TVDs intact', () => {
  const fixture = TestBed.createComponent(WellStructureFormComponent);
  const row = {
    ...emptyPhaseForm(0), bottomMD: 304.8, bottomTVD: 250,
    casingOD: 7, casingID: 6, shoeMD: 304.8, shoeTVD: 250,
  };
  const phase = TestBed.inject(FormBuilder).group(row);
  fixture.componentRef.setInput('phases', new FormArray([phase]));
  fixture.componentRef.setInput('depthUnit', 'ft');
  fixture.detectChanges();
  const input = (name: string): HTMLInputElement => fixture.nativeElement.querySelector(`input[formControlName="${name}"]`);
  expect(input('bottomMD').valueAsNumber).toBe(1000);
  expect(input('shoeMD').valueAsNumber).toBe(1000);
  expect(input('casingOD').valueAsNumber).toBe(7);
  input('shoeMD').value = '900';
  input('shoeMD').dispatchEvent(new Event('input'));
  expect(phase.value.shoeMD).toBe(274.32);
  fixture.componentRef.setInput('derivedGeometry', buildWellGeometry(304.8, 304.8, [{ ...row, bottomTVD: 304.8, shoeTVD: 304.8 }]));
  fixture.detectChanges();
  expect(input('bottomTVD')).toBeNull();
  const outputs = Array.from(fixture.nativeElement.querySelectorAll('output') as NodeListOf<HTMLOutputElement>);
  expect(outputs.map(el => el.textContent?.trim())).toEqual(['0,00', '1.000,00', '1.000,00']);
  expect(phase.value.bottomTVD).toBe(250);
  fixture.componentRef.setInput('derivedGeometry', null);
  fixture.componentRef.setInput('depthUnit', 'm');
  fixture.detectChanges();
  expect(input('bottomTVD').valueAsNumber).toBe(250);
});
