import { describe, expect, it } from 'vitest';
import { caliperAtMD, integrateCaliperHoleVolumeM3, parseCaliperLas } from './caliper-las';

const las = `~VERSION INFORMATION
VERS. 2.0
WRAP. NO
~WELL INFORMATION
NULL. -999.25
~CURVE INFORMATION
DEPT.m : Depth
EHD1.in : Enhanced 1
EHD2.in : Enhanced 2
IHV.m3 : Integrated hole volume
~ASCII
0 10 12 1.0
10 12 14 0.0`;

describe('caliper LAS', () => {
  it('imports the ellipse axes and integrates them along MD', () => {
    const profile = parseCaliperLas(las, 'test.las', '2026-01-01T00:00:00.000Z');
    expect(profile.sampleCount).toBe(2);
    expect(profile.startMD).toBe(0);
    expect(profile.stopMD).toBe(10);
    expect(profile.reportedHoleVolumeM3).toBe(1);
    expect(profile.calculatedHoleVolumeM3).toBeCloseTo(integrateCaliperHoleVolumeM3(profile.samples), 10);
    expect(caliperAtMD(profile.samples, 5)).toMatchObject({ md: 5, ehd1In: 11, ehd2In: 13 });
  });

  it('does not accept a file without both enhanced diameter curves', () => {
    expect(() => parseCaliperLas(las.replace('EHD2.in', 'HD2.in'), 'bad.las')).toThrow(/EHD1 e EHD2/);
  });
});
