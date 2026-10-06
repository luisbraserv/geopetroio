import { describe, expect, it } from 'vitest';
import { primaryContractExample } from '../models/primary-cementing.examples';
import type { PrimaryHydraulicPoint } from '../models/primary-cementing.model';
import type { PrimaryFullSnapshot } from '../models/primary-hydraulics.model';
import { annexWindowBreaches, buildAnnexG1, buildAnnexG2, buildAnnexG3, buildAnnexG4,
  buildAnnexG5, instantsForVolume, primaryVolumeOf, VOLUME_AXIS_LABEL } from './primary-annex-charts';
import type { PrimaryComparisonSeries } from './primary-comparison';

function point(timeMin: number, total: number, cement: number,
  extra: Partial<PrimaryHydraulicPoint> = {}): PrimaryHydraulicPoint {
  return { timeMin, stageId: 'stage-1', stepId: 's1', phase: 'pump', pumpedVolumeBbl: total,
    cementPumpedVolumeBbl: cement, returnedVolumeBbl: 0, cementReturnedBbl: 0, activeOutletMD: 1500,
    pumpRateBpm: 5, outletRateBpm: 5, returnRateBpm: 5, inletDensityPpg: 10,
    requiredPumpPressurePsi: 100, pumpPressurePsi: 100, annularHydrostaticPsi: 1,
    internalHydrostaticPsi: 1, pipeFrictionPsi: 1, annularFrictionPsi: 1, localLossPsi: 0,
    referenceId: 'sapata', bhpPsi: 1, ecdPpg: 10, porePsi: null, fracturePsi: null,
    voidVolumeBbl: null, uTubeDrivePsi: 0, state: 'full',
    references: [{ id: 'sapata', md: 1500, tvd: 1500, pressurePsi: 3000, ecdPpg: 11.7, hydrostaticPsi: 2900 }], ...extra };
}

const profile = (md: number, over: Partial<PrimaryFullSnapshot['profiles'][number]> = {}) => ({
  segmentId: `s-${md}`, zone: 'casing-annulus' as const, fluidId: 'cement', md, tvd: md,
  densityPpg: 16, pressurePsi: 3000, ecdPpg: 11.7, porePpg: 9, fracturePpg: 15,
  reynolds: 1200, correlationId: 'petroguia-r2-f40-f41', correlationVersion: 'primaria-1',
  maxLaminarRe: 400, minTurbulentRe: 6000, ...over });

const snapshot = (profiles: PrimaryFullSnapshot['profiles']): PrimaryFullSnapshot => ({
  timeMin: 5, stageId: 'stage-1', activePathId: 'path', parcels: [], devices: [], plugs: [],
  inventory: [], profiles, reason: 'event', stepId: 's1', pumpRateBpm: 5, activeOutletMD: 1500,
});

describe('annex charts G1 to G5 (P9)', () => {
  /** Caso de aceitação: 10 de espaçador, 20 de pasta e 30 de deslocamento. */
  const program = [
    point(0, 0, 0), point(2, 10, 0), point(6, 30, 20), point(12, 60, 20),
  ];

  it('keeps the cement volume flat while another fluid is pumped', () => {
    expect(program.map(p => primaryVolumeOf(p, 'total-pumped'))).toEqual([0, 10, 30, 60]);
    expect(program.map(p => primaryVolumeOf(p, 'cement-pumped'))).toEqual([0, 0, 20, 20]);
    const total = buildAnnexG1(program, 'total-pumped').find(s => s.id === 'g1-volume')!;
    const cement = buildAnnexG1(program, 'cement-pumped').find(s => s.id === 'g1-volume')!;
    expect(total.label).toBe(VOLUME_AXIS_LABEL['total-pumped']);
    expect(cement.label).toBe('Volume de pasta bombeada (bbl)');
    expect(cement.points.map(p => p.y)).toEqual([0, 0, 20, 20]);
  });

  it('uses the return rate, not the pump rate, for the calculated return', () => {
    const series = buildAnnexG1([point(1, 5, 0, { returnRateBpm: 2, pumpRateBpm: 5 })],
      'total-pumped').find(s => s.id === 'g1-retorno')!;
    expect(series.points[0].y).toBe(2);
  });

  it('leaves the measured series absent instead of copying the calculated one', () => {
    const series = buildAnnexG1(program, 'total-pumped');
    expect(series.every(entry => entry.origin === 'calculated')).toBe(true);
    const measured: PrimaryComparisonSeries = { channelId: 'retorno', channelName: 'Retorno',
      quantity: 'return-rate', unit: 'bpm', overlaps: true, notes: [],
      points: [{ timeMin: 2, measured: 4.2, calculated: 5, difference: -0.8, sourceRow: 2 }] };
    const withMeasured = buildAnnexG1(program, 'total-pumped', [measured]);
    const imported = withMeasured.find(entry => entry.origin === 'measured')!;
    expect(imported.points[0].y).toBe(4.2);
    expect(imported.label).toContain('medido');
  });

  it('keeps repeated volumes in time order and offers every instant of a plateau', () => {
    const paused = [point(0, 30, 20), point(5, 30, 20, { pumpRateBpm: 0 }), point(9, 40, 20)];
    const series = buildAnnexG2(paused, 'total-pumped', ['sapata'])[0];
    // O X repetido não é agrupado nem reordenado: os dois instantes seguem lá.
    expect(series.points.map(p => p.x)).toEqual([30, 30, 40]);
    expect(series.points.map(p => p.timeMin)).toEqual([0, 5, 9]);
    expect(instantsForVolume(paused, 'total-pumped', 30, 4)).toEqual([5, 0]);
    expect(instantsForVolume(paused, 'total-pumped', 999, 0)).toEqual([]);
  });

  it('reads ECD from the requested reference and leaves an unknown one null', () => {
    const series = buildAnnexG2(program, 'total-pumped', ['sapata', 'porta']);
    expect(series[0].points[0].y).toBe(11.7);
    expect(series[1].points.every(p => p.y === null)).toBe(true);
  });

  it('carries both accumulated volumes on every point for the tooltip', () => {
    const series = buildAnnexG1(program, 'cement-pumped').find(s => s.id === 'g1-volume')!;
    expect(series.points[2].totalPumpedBbl).toBe(30);
    expect(series.points[2].cementPumpedBbl).toBe(20);
  });

  it('applies the rest convention of Reynolds zero without evaluating the expression', () => {
    const still = buildAnnexG3(snapshot([profile(500), profile(1500)]),
      point(5, 30, 20, { pumpRateBpm: 0 }), 'casing-annulus');
    expect(still.series.points.map(p => p.value)).toEqual([0, 0]);

    const flowing = buildAnnexG3(snapshot([profile(500)]), point(5, 30, 20), 'casing-annulus');
    expect(flowing.series.points[0].value).toBe(1200);
  });

  it('names the correlation limits instead of treating them as universal', () => {
    const result = buildAnnexG3(snapshot([profile(500)]), point(5, 30, 20), 'casing-annulus');
    expect(result.limits.map(limit => limit.value)).toEqual([400, 6000]);
    expect(result.limits[0].correlationId).toBe('petroguia-r2-f40-f41');
    // Nada de 2000/3000: os limites vêm do motor, não do componente visual.
    expect(result.limits.some(limit => limit.value === 2000)).toBe(false);
  });

  it('keeps an unresolved Reynolds as a gap rather than a fictitious fluid', () => {
    const result = buildAnnexG3(snapshot([profile(500, { reynolds: null })]),
      point(5, 30, 20), 'casing-annulus');
    expect(result.series.points[0].value).toBeNull();
    expect(buildAnnexG3(null, null, 'casing-annulus').series.points).toEqual([]);
  });

  it('separates the internal path from the annular one', () => {
    const mixed = snapshot([profile(500), profile(600, { zone: 'internal', reynolds: 800 })]);
    expect(buildAnnexG3(mixed, point(5, 30, 20), 'internal').series.points.map(p => p.value)).toEqual([800]);
    expect(buildAnnexG3(mixed, point(5, 30, 20), 'casing-annulus').series.label).toContain('anular');
  });

  it('shows the inlet density as a gap during a pause', () => {
    const series = buildAnnexG4([point(3, 30, 20, { inletDensityPpg: null, pumpRateBpm: 0 })])
      .find(entry => entry.id === 'g4-densidade')!;
    expect(series.points[0].y).toBeNull();
    expect(series.label).toBe('Densidade na entrada');
  });

  it('keeps the local density distinct from the equivalent density of the ECD', () => {
    const series = buildAnnexG5(snapshot([profile(1500, { densityPpg: 16, ecdPpg: 11.7 })]));
    const density = series.find(entry => entry.id === 'g5-densidade')!;
    const ecd = series.find(entry => entry.id === 'g5-ecd')!;
    expect(density.points[0].value).toBe(16);
    expect(ecd.points[0].value).toBe(11.7);
    expect(series.map(entry => entry.id)).toEqual(['g5-densidade', 'g5-ecd', 'g5-poro', 'g5-fratura']);
  });

  it('leaves the window as a gap behind previous casing', () => {
    const series = buildAnnexG5(snapshot([
      profile(200, { porePpg: null, fracturePpg: null }), profile(1500)]));
    const pore = series.find(entry => entry.id === 'g5-poro')!;
    expect(pore.points[0].value).toBeNull();
    expect(pore.points[1].value).toBe(9);
  });

  it('flags a window breach without removing the real value', () => {
    const series = buildAnnexG5(snapshot([profile(1500, { ecdPpg: 16 })]));
    const breaches = annexWindowBreaches(series);
    expect(breaches).toEqual([{ md: 1500, kind: 'fracture' }]);
    expect(series.find(entry => entry.id === 'g5-ecd')!.points[0].value).toBe(16);

    const under = buildAnnexG5(snapshot([profile(1500, { ecdPpg: 8 })]));
    expect(annexWindowBreaches(under)).toEqual([{ md: 1500, kind: 'pore' }]);
  });

  it('does not mutate the points it receives', () => {
    const scenario = primaryContractExample('conventional');
    expect(scenario.primary.stages).toHaveLength(1);
    const original = structuredClone(program);
    buildAnnexG1(program, 'total-pumped');
    buildAnnexG4(program);
    expect(program).toEqual(original);
  });
});
