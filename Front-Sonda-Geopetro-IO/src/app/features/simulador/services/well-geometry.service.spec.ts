import { describe, expect, it } from 'vitest';
import { WellGeometryService, formatInches } from './well-geometry.service';
import { WellGeometry, WellPhase } from '../models/well-geometry.model';
import { BBL_M } from '../models/constantes';

/** Poço de referência do enunciado: 4 fases, 2500 m MD / 2350 m TVD. */
const well: WellGeometry = {
  finalMD: 2500,
  finalTVD: 2350,
  phases: [
    {
      id: 'phase-1', name: 'Fase 26"', type: 'CONDUCTOR',
      topMD: 0, bottomMD: 400, topTVD: 0, bottomTVD: 400,
      holeDiameterIn: 26,
      casing: { odIn: 20, idIn: 18.73, bottomMD: 400 },
      shoe: { md: 400, tvd: 400 },
    },
    {
      id: 'phase-2', name: 'Fase 17 1/2"', type: 'SURFACE',
      topMD: 400, bottomMD: 1200, topTVD: 400, bottomTVD: 1180,
      holeDiameterIn: 17.5,
      casing: { odIn: 13.375, idIn: 12.415, bottomMD: 1200 },
      shoe: { md: 1200, tvd: 1180 },
    },
    {
      id: 'phase-3', name: 'Fase 12 1/4"', type: 'INTERMEDIATE',
      topMD: 1200, bottomMD: 2000, topTVD: 1180, bottomTVD: 1880,
      holeDiameterIn: 12.25,
      casing: { odIn: 9.625, idIn: 8.835, bottomMD: 2000 },
      shoe: { md: 2000, tvd: 1880 },
    },
    {
      id: 'phase-4', name: 'Fase 8 1/2"', type: 'OPEN_HOLE',
      topMD: 2000, bottomMD: 2500, topTVD: 1880, bottomTVD: 2350,
      holeDiameterIn: 8.5,
    },
  ],
};

const clonePhase = (id: string, patch: Partial<WellPhase>): WellGeometry => ({
  ...well,
  phases: well.phases.map(p => (p.id === id ? { ...p, ...patch } : p)),
});

describe('WellGeometryService', () => {
  const service = new WellGeometryService();

  describe('MD → TVD', () => {
    it('interpolates inside the phase that contains the MD', () => {
      // fase 3: (1880 − 1180) / (2000 − 1200) = 0,875
      expect(service.mdToTvd(well, 1600)).toBeCloseTo(1530, 9);
      // fase 4: (2350 − 1880) / 500 = 0,94
      expect(service.mdToTvd(well, 2250)).toBeCloseTo(2115, 9);
      expect(service.mdToTvd(well, 0)).toBe(0);
      expect(service.mdToTvd(well, 2500)).toBeCloseTo(2350, 9);
    });

    it('does not leak the ratio of one phase into another', () => {
      // com o modelo antigo de duas retas, 1600 m cairia numa reta 0→TD
      const singleLine = 1600 * (well.finalTVD / well.finalMD);
      expect(service.mdToTvd(well, 1600)).not.toBeCloseTo(singleLine, 1);
    });

    it('throws when the MD belongs to no phase', () => {
      expect(() => service.mdToTvd(well, 2600)).toThrowError(/Nenhuma fase encontrada para MD 2600/);
    });

    it('round-trips MD ↔ TVD', () => {
      expect(service.tvdToMd(well, service.mdToTvd(well, 1750))).toBeCloseTo(1750, 6);
    });
  });

  describe('phase lookup', () => {
    it('resolves the phase of a depth and prefers the shallower one at a boundary', () => {
      expect(service.phaseAtMD(well, 1500)?.id).toBe('phase-3');
      expect(service.phaseAtMD(well, 2000)?.id).toBe('phase-3');
      expect(service.phaseAtMD(well, 2000.5)?.id).toBe('phase-4');
      expect(service.phaseAtMD(well, 3000)).toBeNull();
    });

    it('resolves the phase by TVD', () => {
      expect(service.phaseAtTVD(well, 1500)?.id).toBe('phase-3');
      expect(service.phaseAtTVD(well, 2000)?.id).toBe('phase-4');
    });

    it('lists every phase an interval crosses', () => {
      expect(service.getPhasesBetween(well, 1400, 1500).map(p => p.id)).toEqual(['phase-3']);
      expect(service.getPhasesBetween(well, 1950, 2050).map(p => p.id)).toEqual(['phase-3', 'phase-4']);
      expect(service.getPhasesBetween(well, 300, 2100).map(p => p.id))
        .toEqual(['phase-1', 'phase-2', 'phase-3', 'phase-4']);
    });
  });

  describe('geometry segments', () => {
    it('splits an interval that crosses phases', () => {
      const segments = service.getGeometrySegments(well, 1950, 2050);
      expect(segments).toHaveLength(2);
      expect(segments[0]).toMatchObject({
        topMD: 1950, bottomMD: 2000, phaseId: 'phase-3',
        holeDiameterIn: 12.25, casingIdIn: 8.835, cased: true, innerDiameterIn: 8.835,
      });
      expect(segments[1]).toMatchObject({
        topMD: 2000, bottomMD: 2050, phaseId: 'phase-4',
        holeDiameterIn: 8.5, cased: false, innerDiameterIn: 8.5,
      });
      expect(segments[1].casingIdIn).toBeUndefined();
    });

    it('keeps a single segment when the interval stays in one phase', () => {
      const segments = service.getGeometrySegments(well, 1400, 1500);
      expect(segments).toHaveLength(1);
      expect(segments[0].innerDiameterIn).toBe(8.835);
    });

    it('splits at the casing shoe when the casing does not run the whole phase', () => {
      // liner do meio da fase 3 para baixo: acima dele o trecho é poço aberto
      const geometry = clonePhase('phase-3', { casing: { odIn: 9.625, idIn: 8.835, topMD: 1600, bottomMD: 2000 } });
      const segments = service.getGeometrySegments(geometry, 1400, 1800);
      expect(segments.map(s => [s.topMD, s.bottomMD, s.innerDiameterIn]))
        .toEqual([[1400, 1600, 12.25], [1600, 1800, 8.835]]);
    });

    it('carries the TVD of each segment boundary', () => {
      const [segment] = service.getGeometrySegments(well, 1200, 1600);
      expect(segment.topTVD).toBeCloseTo(1180, 9);
      expect(segment.bottomTVD).toBeCloseTo(1530, 9);
    });

    it('returns nothing for a degenerate interval', () => {
      expect(service.getGeometrySegments(well, 1500, 1500)).toEqual([]);
    });
  });

  describe('capacities', () => {
    it('uses the shallower phase at its shoe and remains defined at the well bottom', () => {
      expect(service.getCapacityAtMD(well, 2000, { kind: 'open' })).toBeCloseTo(BBL_M * 8.835 ** 2, 12);
      expect(service.getCapacityAtMD(well, 2500, { kind: 'open' })).toBeCloseTo(BBL_M * 8.5 ** 2, 12);
      expect(() => service.getCapacityAtMD(well, 2501, { kind: 'open' })).toThrow();
    });

    it('does not look past a nearby diameter change', () => {
      expect(service.getCapacityAtMD(well, 1999.999, { kind: 'open' })).toBeCloseTo(BBL_M * 8.835 ** 2, 12);
      const partial = clonePhase('phase-3', { casing: { odIn: 9.625, idIn: 8.835, bottomMD: 1800 } });
      expect(service.getCapacityAtMD(partial, 1800, { kind: 'open' })).toBeCloseTo(BBL_M * 8.835 ** 2, 12);
      expect(service.getCapacityAtMD(partial, 1800.001, { kind: 'open' })).toBeCloseTo(BBL_M * 12.25 ** 2, 12);
    });
    it('derives bbl/m from the effective inner diameter', () => {
      const open = service.getCapacityAtMD(well, 1500, { kind: 'open' });
      expect(open).toBeCloseTo(BBL_M * 8.835 ** 2, 12);

      const annulus = service.getCapacityAtMD(well, 1500, { kind: 'annulus', pipeOD: 3.5 });
      expect(annulus).toBeCloseTo(BBL_M * (8.835 ** 2 - 3.5 ** 2), 12);

      const pipe = service.getCapacityAtMD(well, 1500, { kind: 'pipe', pipeID: 2.764 });
      expect(pipe).toBeCloseTo(BBL_M * 2.764 ** 2, 12);

      const both = service.getCapacityAtMD(well, 1500, { kind: 'annulusPlusPipe', pipeOD: 3.5, pipeID: 2.764 });
      expect(both).toBeCloseTo(annulus + pipe, 12);
    });

    it('uses the open hole diameter where there is no casing', () => {
      expect(service.getCapacityAtMD(well, 2200, { kind: 'open' })).toBeCloseTo(BBL_M * 8.5 ** 2, 12);
    });
  });

  describe('volume ↔ height across geometry changes', () => {
    const openResolver = service.capacityResolver({ kind: 'open' });

    it('matches volume / capacity while inside a single segment', () => {
      const capacity = service.getCapacityAtMD(well, 1900, { kind: 'open' });
      const volume = capacity * 40;
      const result = service.calculateTopFromVolume(well, 1900, volume, openResolver);
      expect(result.topMD).toBeCloseTo(1860, 6);
      expect(result.remainingVolumeBbl).toBe(0);
    });

    it('consumes volume upwards through a change of diameter', () => {
      const openHoleCapacity = BBL_M * 8.5 ** 2;
      const casedCapacity = BBL_M * 8.835 ** 2;
      // enche 2000–2050 no poço aberto e mais 20 m acima da sapata, já revestido
      const volume = openHoleCapacity * 50 + casedCapacity * 20;
      const result = service.calculateTopFromVolume(well, 2050, volume, openResolver);
      expect(result.topMD).toBeCloseTo(1980, 6);
      expect(result.segments.map(s => s.phaseId)).toEqual(['phase-3', 'phase-4']);
      // a altura total (70 m) difere do que uma capacidade única daria
      expect(volume / openHoleCapacity).not.toBeCloseTo(70, 1);
    });

    it('round-trips against calculateVolumeBetween', () => {
      const volume = 12.5;
      const { topMD } = service.calculateTopFromVolume(well, 2050, volume, openResolver);
      expect(service.calculateVolumeBetween(well, topMD, 2050, openResolver)).toBeCloseTo(volume, 9);
    });

    it('reports the volume that does not fit in the well', () => {
      const result = service.calculateTopFromVolume(well, 2050, 10_000, openResolver);
      expect(result.topMD).toBe(0);
      expect(result.remainingVolumeBbl).toBeGreaterThan(0);
      expect(result.filledVolumeBbl).toBeLessThan(10_000);
    });
  });

  describe('describeInterval', () => {
    it('resolves the phase and the casing of the operation', () => {
      const description = service.describeInterval(well, { topMD: 1400, bottomMD: 1500 });
      expect(description.primaryPhase?.name).toBe('Fase 12 1/4"');
      expect(description.casingLabel).toBe('9 5/8"');
      expect(description.crossesPhases).toBe(false);
      expect(description.bottomTVD).toBeCloseTo(1442.5, 9);
    });

    it('flags an operation that crosses phases', () => {
      const description = service.describeInterval(well, { topMD: 1950, bottomMD: 2050 });
      expect(description.crossesPhases).toBe(true);
      expect(description.phases.map(p => p.id)).toEqual(['phase-3', 'phase-4']);
      // ancorada na fase da BASE
      expect(description.primaryPhase?.id).toBe('phase-4');
      expect(description.casingLabel).toBeNull();
    });
  });

  describe('validation', () => {
    it.each([Number.NaN, Infinity, -1])('rejects invalid required depths (%s)', value => {
      expect(service.hasErrors(service.validate({ ...well, finalTVD: value }))).toBe(true);
      for (const field of ['topMD', 'bottomMD', 'topTVD', 'bottomTVD'] as const) {
        expect(service.validate(clonePhase('phase-3', { [field]: value })).some(i => i.code === 'PHASE_DEPTH_INVALID')).toBe(true);
      }
    });

    it('rejects non-finite diameters and casing/shoe depths', () => {
      expect(service.hasErrors(service.validate(clonePhase('phase-3', { holeDiameterIn: Infinity })))).toBe(true);
      expect(service.hasErrors(service.validate(clonePhase('phase-3', { casing: { odIn: Infinity, idIn: 8, bottomMD: 2000 } })))).toBe(true);
      expect(service.validate(clonePhase('phase-3', { casing: { odIn: 9.625, idIn: 8.835, bottomMD: Number.NaN } })).some(i => i.code === 'CASING_DEPTH_INVALID')).toBe(true);
      expect(service.validate(clonePhase('phase-3', { shoe: { md: 2000, tvd: Number.NaN } })).some(i => i.code === 'SHOE_DEPTH_INVALID')).toBe(true);
    });

    it('rejects a discontinuity in TVD between adjacent phases', () => {
      expect(service.validate(clonePhase('phase-3', { topTVD: 1170 })).some(i => i.code === 'PHASE_TVD_DISCONTINUITY')).toBe(true);
    });

    it('rejects a TVD increment greater than the MD increment', () => {
      // Each endpoint still satisfies TVD <= MD.
      expect(service.validate(clonePhase('phase-3', { topTVD: 1000, bottomTVD: 1900 })).some(i => i.code === 'PHASE_TVD_LENGTH')).toBe(true);
    });

    it('requires the declared final TVD to match the deepest phase', () => {
      expect(service.validate({ ...well, finalTVD: 2300 }).some(i => i.code === 'WELL_FINAL_TVD_MISMATCH')).toBe(true);
    });
    it('accepts a well without gaps or overlaps', () => {
      expect(service.validate(well)).toEqual([]);
    });

    it('detects overlapping phases', () => {
      const geometry = clonePhase('phase-3', { topMD: 1100 });
      const issues = service.validate(geometry);
      expect(issues.some(i => i.code === 'PHASE_OVERLAP' && i.level === 'error')).toBe(true);
    });

    it('detects gaps between phases', () => {
      const geometry = clonePhase('phase-3', { topMD: 1300 });
      const issues = service.validate(geometry);
      expect(issues.some(i => i.code === 'PHASE_GAP' && i.level === 'error')).toBe(true);
    });

    it('detects an inverted phase', () => {
      const geometry = clonePhase('phase-3', { bottomMD: 1100 });
      expect(service.validate(geometry).some(i => i.code === 'PHASE_MD_ORDER')).toBe(true);
    });

    it('detects a phase below the bottom of the well', () => {
      const geometry: WellGeometry = { ...well, finalMD: 2200 };
      expect(service.validate(geometry).some(i => i.code === 'PHASE_BELOW_TD')).toBe(true);
    });

    it('detects a shoe outside its phase', () => {
      const geometry = clonePhase('phase-3', { shoe: { md: 2200, tvd: 2050 } });
      expect(service.validate(geometry).some(i => i.code === 'SHOE_OUT_OF_PHASE')).toBe(true);
    });

    it('detects invalid diameters', () => {
      expect(service.validate(clonePhase('phase-3', { holeDiameterIn: 0 }))
        .some(i => i.code === 'PHASE_HOLE_DIAMETER')).toBe(true);
      expect(service.validate(clonePhase('phase-3', { casing: { odIn: 9.625, idIn: 9.9, bottomMD: 2000 } }))
        .some(i => i.code === 'CASING_ID_GE_OD')).toBe(true);
      expect(service.validate(clonePhase('phase-3', { casing: { odIn: 13.375, idIn: 12.415, bottomMD: 2000 } }))
        .some(i => i.code === 'CASING_OD_GT_HOLE')).toBe(true);
    });

    it('detects TVD greater than MD', () => {
      const geometry = clonePhase('phase-4', { bottomTVD: 2600 });
      expect(service.validate(geometry).some(i => i.code === 'PHASE_TVD_GT_MD')).toBe(true);
    });
  });

  describe('perforations', () => {
    it('accepts perforations inside the well', () => {
      expect(service.validatePerforations(well, [{ id: 'p1', topMD: 2320, bottomMD: 2340 }])).toEqual([]);
    });

    it('reports a perforation below the bottom of the well instead of clamping it', () => {
      const issues = service.validatePerforations(well, [{ id: 'p1', topMD: 2450, bottomMD: 2570 }]);
      expect(issues.some(i => i.code === 'INTERVAL_BELOW_TD' && i.level === 'error')).toBe(true);
      expect(issues[0].message).toContain('abaixo do fundo do poço');
    });

    it('reports overlapping perforations', () => {
      const issues = service.validatePerforations(well, [
        { id: 'p1', topMD: 2300, bottomMD: 2350 },
        { id: 'p2', topMD: 2330, bottomMD: 2360 },
      ]);
      expect(issues.some(i => i.code === 'PERF_OVERLAP')).toBe(true);
    });
  });

  describe('legacy migration', () => {
    const legacy = service.legacySectionToWellGeometry({
      sectionStartMD: 1400, sectionEndMD: 1500,
      sectionStartTVD: 1400, sectionEndTVD: 1500,
      wellFinalMD: 1600, wellFinalTVD: 1600,
      holeDiameterIn: 8.535, casingOD: 5.5, casingID: 4.778,
    });

    it('produces a continuous well with no validation errors', () => {
      expect(service.hasErrors(service.validate(legacy))).toBe(false);
      expect(legacy.phases[0].topMD).toBe(0);
      expect(legacy.phases.at(-1)!.bottomMD).toBe(1600);
    });

    it('keeps the legacy section as the working phase', () => {
      const section = legacy.phases.find(p => p.id === 'legacy-section')!;
      expect([section.topMD, section.bottomMD]).toEqual([1400, 1500]);
      expect(service.mdToTvd(legacy, 1450)).toBeCloseTo(1450, 9);
    });

    it('covers the whole well for MD → TVD', () => {
      expect(service.mdToTvd(legacy, 0)).toBe(0);
      expect(service.mdToTvd(legacy, 1600)).toBeCloseTo(1600, 9);
    });
  });

  describe('formatInches', () => {
    it('formats field fractions', () => {
      expect(formatInches(9.625)).toBe('9 5/8"');
      expect(formatInches(12.25)).toBe('12 1/4"');
      expect(formatInches(13.375)).toBe('13 3/8"');
      expect(formatInches(20)).toBe('20"');
      expect(formatInches(17.5)).toBe('17 1/2"');
    });

    it('falls back to decimals for measured diameters', () => {
      expect(formatInches(8.535)).toBe('8.535"');
    });
  });
});
