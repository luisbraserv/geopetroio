import { TestBed } from '@angular/core/testing';
import { FormArray, FormBuilder } from '@angular/forms';
import { afterEach, expect, it } from 'vitest';
import { WellStructureFormComponent } from './well-structure-form.component';
import { API_CASING_SIZES } from '../../models/api-tubulares';
import { buildWellGeometry, emptyPhaseForm } from '../../models/well-geometry.form';
import { WellGeometryService } from '../../services/well-geometry.service';

afterEach(() => TestBed.resetTestingModule());

it('offers API casing through 20 inches and applies the selected OD and ID', () => {
  const fixture = TestBed.createComponent(WellStructureFormComponent);
  const phase = TestBed.inject(FormBuilder).nonNullable.group({
    ...emptyPhaseForm(0), bottomMD: 400, bottomTVD: 400,
    holeDiameterIn: 26, shoeMD: 400, shoeTVD: 400,
  });
  fixture.componentRef.setInput('phases', new FormArray([phase]));
  fixture.componentRef.setInput('casingOptions', API_CASING_SIZES);
  fixture.detectChanges();

  const casingSelect: HTMLSelectElement = fixture.nativeElement.querySelector('select[aria-label="Revestimento API da fase 1"]');
  const optionIndex = API_CASING_SIZES.findIndex(casing => casing.odIn === 20 && casing.weightLbFt === 133);
  const labels = Array.from(casingSelect.options, option => option.textContent?.trim());
  expect(labels.filter(label => label?.startsWith('20"'))).toHaveLength(3);

  casingSelect.value = String(optionIndex);
  casingSelect.dispatchEvent(new Event('change'));
  fixture.detectChanges();

  expect(phase.value.casingOD).toBe(20);
  expect(phase.value.casingID).toBe(18.73);
});

it('keeps the hole diameter editable and independent from the selected API casing', () => {
  const fixture = TestBed.createComponent(WellStructureFormComponent);
  const row = {
    ...emptyPhaseForm(0), bottomMD: 400, bottomTVD: 400,
    holeDiameterIn: 8.5, shoeMD: 400, shoeTVD: 400,
  };
  const phase = TestBed.inject(FormBuilder).nonNullable.group(row);
  const geometryService = TestBed.inject(WellGeometryService);
  fixture.componentRef.setInput('phases', new FormArray([phase]));
  fixture.componentRef.setInput('casingOptions', [{ odIn: 9.625, idIn: 8.835, weightLbFt: 40 }]);
  fixture.detectChanges();

  const holeInput: HTMLInputElement = fixture.nativeElement.querySelector('input[formControlName="holeDiameterIn"]');
  const casingSelect: HTMLSelectElement = fixture.nativeElement.querySelector('select[aria-label="Revestimento API da fase 1"]');
  expect(holeInput.readOnly).toBe(false);
  expect(holeInput.disabled).toBe(false);
  casingSelect.value = '0';
  casingSelect.dispatchEvent(new Event('change'));
  fixture.detectChanges();

  expect(phase.value.casingOD).toBe(9.625);
  expect(phase.value.casingID).toBe(8.835);
  expect(phase.value.holeDiameterIn).toBe(8.5);
  expect(holeInput.valueAsNumber).toBe(8.5);
  const validate = () => geometryService.validate(buildWellGeometry(400, 400, [{ ...row, ...phase.getRawValue() }]));
  expect(validate().some(issue => issue.code === 'CASING_OD_GT_HOLE')).toBe(true);

  holeInput.value = '12.25';
  holeInput.dispatchEvent(new Event('input'));
  fixture.detectChanges();

  expect(phase.value.holeDiameterIn).toBe(12.25);
  expect(phase.value.casingOD).toBe(9.625);
  expect(phase.value.casingID).toBe(8.835);
  expect(validate()).toEqual([]);
});

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
