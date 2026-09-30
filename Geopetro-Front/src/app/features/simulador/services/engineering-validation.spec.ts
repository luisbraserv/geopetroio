import { describe, expect, it } from 'vitest';
import { validateEngineeringRelations } from './engineering-validation';

describe('Engineering relations', () => {
  it('accepts ordered gradients, densities and equal Fann readings', () => {
    expect(validateEngineeringRelations({ fractureGradient: 16, poreGradient: 9,
      slurryDensity: 15.8, displacementDensity: 8.4,
      thetaReadings: { theta600: 20, theta300: 20, theta200: 10, theta3: 0 } })).toEqual([]);
  });

  it.each([8, 9])('warns, without blocking, when fracture gradient %s does not exceed pore gradient', fractureGradient => {
    expect(validateEngineeringRelations({ fractureGradient, poreGradient: 9 }))
      .toEqual([expect.objectContaining({ code: 'FRACTURE_PORE_ORDER', level: 'warning' })]);
  });

  it.each([8, 8.4])('warns when slurry density %s does not exceed displacement density', slurryDensity => {
    expect(validateEngineeringRelations({ slurryDensity, displacementDensity: 8.4 }))
      .toEqual([expect.objectContaining({ code: 'SLURRY_DISPLACEMENT_DENSITY', level: 'warning' })]);
  });

  it('reports all Fann inversions once, including the intermediate speeds in the UI', () => {
    const issues = validateEngineeringRelations({ thetaReadings: {
      theta600: 200, theta300: 210, theta200: 100, theta100: 80,
      theta60: 90, theta30: 20, theta20: 25, theta10: 10, theta6: 8, theta3: 9,
    } });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('FANN_READING_ORDER');
    for (const pair of ['θ600 < θ300', 'θ100 < θ60', 'θ30 < θ20', 'θ6 < θ3']) {
      expect(issues[0].message).toContain(pair);
    }
  });

  it.each([null, undefined, '', ' ', NaN, Infinity])('does not interpret missing or invalid values (%s) as zero', value => {
    expect(validateEngineeringRelations({ fractureGradient: value, poreGradient: 9,
      slurryDensity: value, displacementDensity: 8.4,
      thetaReadings: { theta300: value, theta200: 100 } })).toEqual([]);
  });

  it('checks the union of perforated intervals, including boundaries, without mutating them', () => {
    const perforations = [{ top: 100, base: 200 }, { top: 300, base: 400 }];
    const before = structuredClone(perforations);
    for (const referenceMD of [100, 200, 300, 400]) {
      expect(validateEngineeringRelations({ squeeze: { referenceMD, perforations } })).toEqual([]);
    }
    for (const referenceMD of [50, 250, 450]) {
      expect(validateEngineeringRelations({ squeeze: { referenceMD, perforations } }))
        .toEqual([expect.objectContaining({ code: 'SQUEEZE_REFERENCE_OUTSIDE_PERFORATIONS', level: 'warning' })]);
    }
    expect(perforations).toEqual(before);
  });

  it('leaves invalid or absent perforations to the geometry validator', () => {
    expect(validateEngineeringRelations({ squeeze: { referenceMD: 250, perforations: [] } })).toEqual([]);
    expect(validateEngineeringRelations({ squeeze: { referenceMD: 250,
      perforations: [{ top: 200, base: 100 }] } })).toEqual([]);
  });
});
