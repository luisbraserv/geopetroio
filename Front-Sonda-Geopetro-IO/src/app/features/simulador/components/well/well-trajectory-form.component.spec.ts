import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { afterEach, expect, it } from 'vitest';
import { WellTrajectoryFormComponent } from './well-trajectory-form.component';
import { createTrajectoryForm } from '../../models/well-trajectory.form';

afterEach(() => TestBed.resetTestingModule());

it('edits survey MD in feet while retaining canonical metres and angles', () => {
  const fixture = TestBed.createComponent(WellTrajectoryFormComponent);
  const form = createTrajectoryForm(TestBed.inject(FormBuilder), {
    enabled: true, stations: [{ md: 304.8, inclinationDeg: 30, azimuthDeg: 270 }],
  });
  fixture.componentRef.setInput('form', form);
  fixture.componentRef.setInput('depthUnit', 'ft');
  fixture.detectChanges();
  const input: HTMLInputElement = fixture.nativeElement.querySelector('input[formControlName="md"]');
  expect(input.valueAsNumber).toBe(1000);
  input.value = '2000';
  input.dispatchEvent(new Event('input'));
  expect(form.value.stations[0]).toEqual({ md: 609.6, inclinationDeg: 30, azimuthDeg: 270 });
  fixture.componentRef.setInput('depthUnit', 'm');
  fixture.detectChanges();
  expect(input.valueAsNumber).toBe(609.6);
});

it('edita estações sem preencher ângulos desconhecidos e mantém dados ao desativar survey', () => {
  const fixture = TestBed.createComponent(WellTrajectoryFormComponent);
  const form = createTrajectoryForm(TestBed.inject(FormBuilder), { enabled: true });
  fixture.componentRef.setInput('form', form);
  fixture.detectChanges();
  const add = () => (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
  add();
  fixture.detectChanges();
  expect(form.value.stations).toEqual([{ md: 0, inclinationDeg: null, azimuthDeg: null }]);
  const inc = fixture.nativeElement.querySelector('input[formControlName="inclinationDeg"]') as HTMLInputElement;
  inc.value = '30';
  inc.dispatchEvent(new Event('input'));
  expect(form.value.stations[0].inclinationDeg).toBe(30);
  form.patchValue({ enabled: false });
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('table')).toBeNull();
  expect(form.value.stations[0].inclinationDeg).toBe(30);
});
