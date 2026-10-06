import { describe, expect, it } from 'vitest';
import type { WellPhaseFormValue } from '../models/well-geometry.form';
import { buildPrimaryTrajectory, redistributePhaseSurveys, validatePhaseSurveys } from './phase-survey';

const rows: WellPhaseFormValue[] = [
  { id: 'a', name: 'A', type: 'SURFACE', topMD: 0, bottomMD: 100, topTVD: 0, bottomTVD: 100,
    holeDiameterIn: 12, casingOD: 9, casingID: 8, shoeMD: 100, shoeTVD: 100,
    survey: { enabled: true, stations: [{ md: 50, inclinationDeg: 10, azimuthDeg: 20 }] } },
  { id: 'b', name: 'B', type: 'PRODUCTION', topMD: 100, bottomMD: 200, topTVD: 100, bottomTVD: 195,
    holeDiameterIn: 8, casingOD: 7, casingID: 6, shoeMD: 200, shoeTVD: 195,
    survey: { enabled: false, stations: [] } },
];

describe('phase survey', () => {
  it('builds one continuous trajectory through surveyed and manual phases', () => {
    const trajectory = buildPrimaryTrajectory(rows)!;
    expect(trajectory.stations[0].md).toBe(0);
    expect(trajectory.stations.at(-1)!.md).toBe(200);
    expect(trajectory.stations.some(station => station.md === 50)).toBe(true);
  });
  it('moves stations when a phase boundary changes', () => {
    const changed = redistributePhaseSurveys([{ ...rows[0], bottomMD: 40 }, { ...rows[1], topMD: 40 }]);
    expect(changed[0].survey!.stations).toHaveLength(0);
    expect(changed[1].survey!.stations).toHaveLength(1);
  });
  it('rejects duplicate MDs across phase lists', () => {
    const invalid = structuredClone(rows);
    invalid[1].survey = { enabled: true, stations: [{ md: 50, inclinationDeg: 0, azimuthDeg: 0 }] };
    expect(validatePhaseSurveys(invalid).some(issue => issue.code === 'PHASE_SURVEY_DUPLICATE_MD')).toBe(true);
  });
});
