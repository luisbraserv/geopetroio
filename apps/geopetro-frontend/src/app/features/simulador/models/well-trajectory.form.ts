import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { WellTrajectory } from './well-geometry.model';
import { geometryNumber } from './well-geometry.form';

export interface TrajectoryFormValue {
  enabled?: boolean;
  stations?: Array<{ md: number | null; inclinationDeg: number | null; azimuthDeg: number | null }>;
}

export function createTrajectoryForm(fb: FormBuilder, value?: TrajectoryFormValue): FormGroup {
  return fb.group({
    enabled: [value?.enabled === true],
    stations: fb.array((Array.isArray(value?.stations) ? value!.stations! : []).map(s => fb.group({
      md: [s.md], inclinationDeg: [s.inclinationDeg], azimuthDeg: [s.azimuthDeg],
    }))),
  });
}

export function trajectoryFromForm(value?: TrajectoryFormValue): WellTrajectory | undefined {
  return value?.enabled === true ? { stations: (value.stations ?? []).map(s => ({
    md: geometryNumber(s.md), inclinationDeg: geometryNumber(s.inclinationDeg), azimuthDeg: geometryNumber(s.azimuthDeg),
  })) } : undefined;
}
