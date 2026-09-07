import { describe, expect, it } from 'vitest';
import { buildWellGeometry, phaseFormToWellPhase, WellPhaseFormValue, wellGeometryToForms } from './well-geometry.form';
import { WellGeometryService } from '../services/well-geometry.service';

const row: WellPhaseFormValue = {
  id: 'p1', name: 'Produção', type: 'PRODUCTION',
  topMD: 0, bottomMD: 1500, topTVD: 0, bottomTVD: 1400,
  holeDiameterIn: 8.5, casingOD: 5.5, casingID: 4.778,
  shoeMD: 1500, shoeTVD: 1400,
};
const service = new WellGeometryService();

describe('formulário da geometria', () => {
  it('accepts explicit zero at the surface', () => {
    expect(service.validate(buildWellGeometry(1500, 1400, [row]))).toEqual([]);
  });

  it.each(['topMD', 'bottomMD', 'topTVD', 'bottomTVD', 'holeDiameterIn'] as const)(
    'keeps a missing %s invalid instead of substituting zero', field => {
      const geometry = buildWellGeometry(1500, 1400, [{ ...row, [field]: null }]);
      expect(Number.isNaN(geometry.phases[0][field])).toBe(true);
      expect(service.hasErrors(service.validate(geometry))).toBe(true);
    },
  );

  it('rejects missing final depths', () => {
    expect(service.hasErrors(service.validate(buildWellGeometry(null, null, [row])))).toBe(true);
  });

  it.each([{ casingOD: null }, { casingID: null }, { casingID: -1 }, { casingOD: Infinity }])(
    'does not silently remove an incomplete or invalid casing (%j)', patch => {
      const geometry = buildWellGeometry(1500, 1400, [{ ...row, ...patch }]);
      expect(geometry.phases[0].casing).toBeDefined();
      expect(service.hasErrors(service.validate(geometry))).toBe(true);
    },
  );

  it('allows an open hole with both casing fields empty', () => {
    const phase = phaseFormToWellPhase({ ...row, casingOD: null, casingID: null, shoeMD: null, shoeTVD: null }, 0);
    expect(phase.casing).toBeUndefined();
    expect(phase.shoe).toBeUndefined();
  });

  it.each([{ shoeMD: -1 }, { shoeTVD: null }, { shoeMD: null }])('reports an invalid or incomplete shoe (%j)', patch => {
    const geometry = buildWellGeometry(1500, 1400, [{ ...row, ...patch }]);
    expect(geometry.phases[0].shoe).toBeDefined();
    expect(service.hasErrors(service.validate(geometry))).toBe(true);
  });

  it('round-trips a legacy deviated well with casings without explicit shoes', () => {
    const legacy = service.legacySectionToWellGeometry({
      sectionStartMD: 1000, sectionEndMD: 1500,
      sectionStartTVD: 900, sectionEndTVD: 1300,
      wellFinalMD: 1800, wellFinalTVD: 1500,
      holeDiameterIn: 8.5, casingOD: 5.5, casingID: 4.778,
    });
    const rebuilt = buildWellGeometry(legacy.finalMD, legacy.finalTVD, wellGeometryToForms(legacy));
    expect(service.validate(rebuilt)).toEqual([]);
    for (const md of [0, 500, 1000, 1250, 1500, 1800]) {
      expect(service.mdToTvd(rebuilt, md)).toBeCloseTo(service.mdToTvd(legacy, md), 9);
      expect(service.getCapacityAtMD(rebuilt, md, { kind: 'open' })).toBeCloseTo(service.getCapacityAtMD(legacy, md, { kind: 'open' }), 9);
    }
  });
});
