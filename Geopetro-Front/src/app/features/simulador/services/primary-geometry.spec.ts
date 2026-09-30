import { describe, expect, it } from 'vitest';
import type { ConventionalPrimaryGeometryInput } from '../models/primary-geometry.model';
import type { WellGeometry } from '../models/well-geometry.model';
import { WellGeometryService } from './well-geometry.service';

function fixture(): { well: WellGeometry; input: ConventionalPrimaryGeometryInput } {
  return {
    well: { finalMD: 1500, finalTVD: 1500, phases: [
      { id: 'hole', name: 'Poço aberto', type: 'OPEN_HOLE', topMD: 0, bottomMD: 1500,
        topTVD: 0, bottomTVD: 1500, holeDiameterIn: 8.5 },
    ] },
    input: {
      target: { kind: 'conventional', casingAssemblyId: 'target', floatCollarMD: 1480, shoeMD: 1500 },
      assemblies: [{ id: 'target', name: 'Revestimento-alvo', role: 'target-casing',
        sections: [{ id: 'target-section', topMD: 0, bottomMD: 1500, idIn: 6.276, odIn: 7 }] }],
      outerBoundaries: [{ id: 'outer-hole', kind: 'open-hole', phaseId: 'hole', topMD: 0, bottomMD: 1500,
        diameter: { source: 'nominal', excessFraction: 0 } }],
      splitMDs: [500],
    },
  };
}

describe('primary conventional geometry (P2)', () => {
  const service = new WellGeometryService();

  it('matches the independently specified base volumes and preserves inputs', () => {
    const f = fixture(); const before = structuredClone(f);
    const result = service.resolveConventionalPrimaryGeometry(f.well, f.input);
    expect(result.issues).toEqual([]);
    expect(result.segments.map(s => [s.topMD, s.bottomMD])).toEqual([[0, 500], [500, 1480], [1480, 1500]]);
    expect(result.segments[0].pipeCapacityBblM).toBeCloseTo(0.1255340557296, 12);
    expect(result.segments[0].annularCapacityBblM).toBeCloseTo(0.074100075, 12);
    expect(result.capacities!.internalBbl).toBeCloseTo(188.3010835944, 10);
    expect(result.capacities!.shoeTrackBbl).toBeCloseTo(2.510681114592, 10);
    expect(result.capacities!.displacementToCollarBbl).toBeCloseTo(185.790402479808, 10);
    expect(service.primaryVolumeBetween(result.segments, 'casing-annulus', 500, 1500)).toBeCloseTo(74.100075, 10);
    expect(f).toEqual(before);
  });

  it('uses the previous casing ID as the outer wall, never its OD or the target ID', () => {
    const { well, input } = fixture();
    well.phases = [
      { id: 'upper', name: 'Superfície', type: 'SURFACE', topMD: 0, bottomMD: 500,
        topTVD: 0, bottomTVD: 500, holeDiameterIn: 12.25,
        casing: { idIn: 8.835, odIn: 9.625, bottomMD: 500 } },
      { ...well.phases[0], topMD: 500, topTVD: 500 },
    ];
    input.assemblies.push({ id: 'previous', name: 'Anterior', role: 'previous-casing',
      sections: [{ id: 'previous-section', topMD: 0, bottomMD: 500, idIn: 8.835, odIn: 9.625 }] });
    input.outerBoundaries = [
      { id: 'outer-previous', kind: 'previous-casing', assemblyId: 'previous', topMD: 0, bottomMD: 500 },
      { id: 'outer-hole', kind: 'open-hole', phaseId: 'hole', topMD: 500, bottomMD: 1500,
        diameter: { source: 'nominal', excessFraction: 0 } },
    ];
    const result = service.resolveConventionalPrimaryGeometry(well, input);
    expect(result.issues).toEqual([]);
    expect(result.segments[0]).toMatchObject({ outerDiameterIn: 8.835, casingODIn: 7,
      outerBoundary: 'previous-casing', outerBoundaryId: 'outer-previous' });
    expect(result.segments[0].annularCapacityBblM).toBeCloseTo(0.0031871 * (8.835 ** 2 - 7 ** 2), 12);
    expect(result.segments[1].outerDiameterIn).toBe(8.5);
  });

  it('keeps one effective diameter for excess capacity, transport and future friction', () => {
    const { well, input } = fixture();
    const baseline = service.resolveConventionalPrimaryGeometry(well, input);
    const wall = input.outerBoundaries[0];
    if (wall.kind !== 'open-hole') throw Error('fixture');
    wall.diameter = { source: 'nominal', excessFraction: 0.2 };
    const result = service.resolveConventionalPrimaryGeometry(well, input);
    expect(result.capacities!.annularBbl).toBeCloseTo(baseline.capacities!.annularBbl * 1.2, 10);
    expect(result.capacities!.internalBbl).toBe(baseline.capacities!.internalBbl);
    expect(result.capacities!.shoeTrackBbl).toBe(baseline.capacities!.shoeTrackBbl);
    const s = result.segments[0];
    expect(s.nominalAnnularCapacityBblM).toBeCloseTo(0.074100075, 12);
    expect(s.annularCapacityBblM).toBeCloseTo(0.0031871 * (s.outerDiameterIn ** 2 - s.casingODIn ** 2), 12);
    expect(s.outerDiameterIn).not.toBe(8.5 * 1.2);
  });

  it('uses a measured diameter without imposing nominal clearance or applying extra excess', () => {
    const { well, input } = fixture();
    well.phases[0].holeDiameterIn = 6.5;
    const wall = input.outerBoundaries[0];
    if (wall.kind !== 'open-hole') throw Error('fixture');
    wall.diameter = { source: 'measured', diameterIn: 9 };
    const result = service.resolveConventionalPrimaryGeometry(well, input);
    expect(result.issues).toEqual([]);
    expect(result.segments[0]).toMatchObject({ outerDiameterIn: 9, excessFraction: 0,
      nominalAnnularCapacityBblM: null, diameterSource: 'measured' });
    expect(result.segments[0].annularCapacityBblM).toBeCloseTo(0.1019872, 12);
  });

  it('uses LAS caliper inside its coverage and the manual measured diameter outside it', () => {
    const { well, input } = fixture();
    const wall = input.outerBoundaries[0];
    if (wall.kind !== 'open-hole') throw Error('fixture');
    wall.diameter = { source: 'measured', diameterIn: 9 };
    well.caliper = {
      fileName: 'caliper.las', importedAt: '2026-01-01', depthMnemonic: 'DEPT',
      diameterMnemonics: ['EHD1', 'EHD2'], startMD: 500, stopMD: 1000, sampleCount: 2,
      calculatedHoleVolumeM3: 1, reportedHoleVolumeM3: null, volumeDifferencePct: null,
      samples: [{ md: 500, ehd1In: 10, ehd2In: 12 }, { md: 1000, ehd1In: 10, ehd2In: 12 }],
    };
    const result = service.resolveConventionalPrimaryGeometry(well, input);
    expect(result.issues).toEqual([]);
    expect(result.segments.find(segment => segment.topMD === 500)).toMatchObject({
      diameterSource: 'caliper', caliperEhd1In: 10, caliperEhd2In: 12,
      annularCapacityBblM: 0.0031871 * (120 - 49),
    });
    expect(result.segments.find(segment => segment.topMD === 1000)?.diameterSource).toBe('measured');
  });

  it('splits changes of tubular ID/OD and integrates a partial interval across them', () => {
    const { well, input } = fixture();
    input.assemblies[0].sections = [
      { id: 'upper', topMD: 0, bottomMD: 600, idIn: 6.276, odIn: 7 },
      { id: 'lower', topMD: 600, bottomMD: 1500, idIn: 5.5, odIn: 6 },
    ];
    const result = service.resolveConventionalPrimaryGeometry(well, input);
    expect(result.issues).toEqual([]);
    expect(result.segments.some(s => s.topMD === 600 && s.casingIDIn === 5.5)).toBe(true);
    expect(service.primaryVolumeBetween(result.segments, 'internal', 550, 650))
      .toBeCloseTo(0.0031871 * (6.276 ** 2 * 50 + 5.5 ** 2 * 50), 10);
  });

  it('uses MD for volumes and survey-derived TVD without modifying manual geometry', () => {
    const { well, input } = fixture();
    const baseline = service.resolveConventionalPrimaryGeometry(well, input);
    well.trajectory = { stations: [0, 750, 1500].map(md => ({ md, inclinationDeg: 60, azimuthDeg: 0 })) };
    const result = service.resolveConventionalPrimaryGeometry(well, input);
    expect(result.issues).toEqual([]);
    expect(result.capacities!.internalBbl).toBeCloseTo(baseline.capacities!.internalBbl, 10);
    expect(result.capacities!.annularBbl).toBeCloseTo(baseline.capacities!.annularBbl, 10);
    expect(result.segments.at(-1)!.bottomTVD).toBeCloseTo(750, 9);
    expect(result.segments.some(s => s.bottomMD === 750)).toBe(true);
    expect(well.phases[0].bottomTVD).toBe(1500);
  });

  it('excludes rathole below the target shoe from every capacity', () => {
    const { well, input } = fixture();
    const baseline = service.resolveConventionalPrimaryGeometry(well, input);
    well.finalMD = well.finalTVD = well.phases[0].bottomMD = well.phases[0].bottomTVD = 2000;
    const result = service.resolveConventionalPrimaryGeometry(well, input);
    expect(result.capacities).toEqual(baseline.capacities);
    expect(result.segments.at(-1)!.bottomMD).toBe(1500);
  });

  it('preserves volumes when adding partition cuts, including duplicate cuts', () => {
    const { well, input } = fixture();
    const baseline = service.resolveConventionalPrimaryGeometry(well, input);
    input.splitMDs = [0, 1500, 50, 50, 100, 250, 700, 1470, 1480];
    const result = service.resolveConventionalPrimaryGeometry(well, input);
    expect(result.issues).toEqual([]);
    expect(result.capacities!.internalBbl).toBeCloseTo(baseline.capacities!.internalBbl, 10);
    expect(result.capacities!.annularBbl).toBeCloseTo(baseline.capacities!.annularBbl, 10);
    expect(result.segments.every(s => s.bottomMD > s.topMD)).toBe(true);
  });

  it.each([
    ['ID ≥ OD', (f: ReturnType<typeof fixture>) => { f.input.assemblies[0].sections[0].idIn = 7; }],
    ['OD ≥ outer wall', (f: ReturnType<typeof fixture>) => { f.input.assemblies[0].sections[0].odIn = 8.5; }],
    ['invalid collar', (f: ReturnType<typeof fixture>) => { f.input.target.floatCollarMD = 1500; }],
    ['wall gap', (f: ReturnType<typeof fixture>) => { f.input.outerBoundaries[0].topMD = 10; }],
    ['target gap', (f: ReturnType<typeof fixture>) => { f.input.assemblies[0].sections[0].topMD = 10; }],
    ['phase gap', (f: ReturnType<typeof fixture>) => { f.well.phases[0].topMD = 10; f.well.phases[0].topTVD = 10; }],
    ['nonfinite ID', (f: ReturnType<typeof fixture>) => { f.input.assemblies[0].sections[0].idIn = NaN; }],
    ['invalid survey', (f: ReturnType<typeof fixture>) => { f.well.trajectory = { stations: [] }; }],
    ['cut below shoe', (f: ReturnType<typeof fixture>) => { f.input.splitMDs = [1600]; }],
    ['duplicate wall', (f: ReturnType<typeof fixture>) => { f.input.outerBoundaries.push({ ...f.input.outerBoundaries[0] }); }],
  ] as const)('blocks %s and returns no partial capacities', (_label, mutate) => {
    const f = fixture(); mutate(f);
    const result = service.resolveConventionalPrimaryGeometry(f.well, f.input);
    expect(result.issues.some(i => i.level === 'error')).toBe(true);
    expect(result.segments).toEqual([]);
    expect(result.capacities).toBeNull();
  });

  it('blocks a gap inside the previous casing and cannot reuse the target as outer wall', () => {
    const { well, input } = fixture();
    input.assemblies.push({ id: 'previous', name: 'Anterior', role: 'previous-casing',
      sections: [{ id: 'prev', topMD: 0, bottomMD: 1000, idIn: 8.8, odIn: 9.625 }] });
    input.outerBoundaries = [{ id: 'wall', kind: 'previous-casing', assemblyId: 'previous', topMD: 0, bottomMD: 1500 }];
    expect(service.resolveConventionalPrimaryGeometry(well, input).issues.some(i => i.code === 'PRIMARY_OUTER_CASING_GAP')).toBe(true);
    const wall = input.outerBoundaries[0];
    if (wall.kind !== 'previous-casing') throw Error('fixture');
    wall.assemblyId = 'target';
    expect(service.resolveConventionalPrimaryGeometry(well, input).issues.some(i => i.code === 'PRIMARY_OUTER_CASING')).toBe(true);
  });

  it('does not silently reorder an inverted assembly or change invalid excess', () => {
    const { well, input } = fixture();
    input.assemblies[0].sections = [
      { id: 'bottom', topMD: 500, bottomMD: 1500, idIn: 6.276, odIn: 7 },
      { id: 'top', topMD: 0, bottomMD: 500, idIn: 6.276, odIn: 7 },
    ];
    expect(service.resolveConventionalPrimaryGeometry(well, input).issues.some(i => i.code === 'PRIMARY_ORDER_OVERLAP')).toBe(true);
    input.assemblies[0].sections.reverse();
    const wall = input.outerBoundaries[0];
    if (wall.kind !== 'open-hole') throw Error('fixture');
    wall.diameter = { source: 'nominal', excessFraction: -0.1 };
    expect(service.resolveConventionalPrimaryGeometry(well, input).issues.some(i => i.code === 'PRIMARY_EXCESS')).toBe(true);
  });

  it('rejects an inverted/out-of-range volume query instead of swapping or clipping it', () => {
    const { well, input } = fixture();
    const { segments } = service.resolveConventionalPrimaryGeometry(well, input);
    expect(() => service.primaryVolumeBetween(segments, 'internal', 500, 100)).toThrow();
    expect(() => service.primaryVolumeBetween(segments, 'internal', 0, 1501)).toThrow();
    expect(service.primaryVolumeBetween(segments, 'internal', 500, 500)).toBe(0);
  });
});
