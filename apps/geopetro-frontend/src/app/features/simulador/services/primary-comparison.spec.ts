import { describe, expect, it } from 'vitest';
import type { PrimaryHydraulicPoint } from '../models/primary-cementing.model';
import type { PrimaryMeasuredDataset } from '../models/primary-measurements.model';
import { comparePrimaryMeasurements, primaryResidualSummary } from './primary-comparison';

function point(timeMin: number, returnRate: number | null,
  extra: Partial<PrimaryHydraulicPoint> = {}): PrimaryHydraulicPoint {
  return { timeMin, stageId: 'stage-1', stepId: 's1', phase: 'pump', pumpedVolumeBbl: timeMin * 5,
    cementPumpedVolumeBbl: 0, returnedVolumeBbl: 0, cementReturnedBbl: 0, activeOutletMD: 1500,
    pumpRateBpm: 5, outletRateBpm: 5, returnRateBpm: returnRate, inletDensityPpg: 10,
    requiredPumpPressurePsi: 100, pumpPressurePsi: 100, annularHydrostaticPsi: 1,
    internalHydrostaticPsi: 1, pipeFrictionPsi: 1, annularFrictionPsi: 1, localLossPsi: 0,
    referenceId: 'outlet', bhpPsi: 1, ecdPpg: 10, porePsi: null, fracturePsi: null,
    voidVolumeBbl: null, uTubeDrivePsi: 0, state: 'full', references: [], ...extra };
}

function dataset(samples: { timeMin: number; value: number | null }[],
  overrides: Partial<PrimaryMeasuredDataset> = {}): PrimaryMeasuredDataset {
  return {
    id: 'ds', schemaVersion: 1, name: 'Medido', importedAt: '2026-09-18T12:00:00Z',
    sourceFileName: 'op.csv', mapping: { retorno: { column: 'retorno', originalUnit: 'bpm' } },
    alignment: { offsetMin: 0 }, maxInterpolationGapMin: 3,
    channels: [{ id: 'retorno', name: 'Retorno', location: 'Saída', quantity: 'return-rate', unit: 'bpm' }],
    samples: samples.map((s, i) => ({ sourceRow: i + 2, timeMin: s.timeMin, values: { retorno: s.value } })),
    importDiagnostics: [], ...overrides,
  };
}

describe('measured versus calculated comparison (P8)', () => {
  const points = [point(0, 0), point(2, 5), point(4, 5), point(6, 5)];

  it('samples the calculated series at the measured instants', () => {
    const series = comparePrimaryMeasurements(dataset([{ timeMin: 3, value: 4.8 }]), points)[0];
    expect(series.overlaps).toBe(true);
    expect(series.points[0].calculated).toBeCloseTo(5, 9);
    expect(series.points[0].difference).toBeCloseTo(-0.2, 9);
  });

  it('applies the offset only here, never to the stored samples', () => {
    const shifted = dataset([{ timeMin: 0, value: 4 }], { alignment: { offsetMin: 3 } });
    const series = comparePrimaryMeasurements(shifted, points)[0];
    expect(series.points[0].timeMin).toBe(3);
    // A amostra guardada continua em zero: o offset é de apresentação.
    expect(shifted.samples[0].timeMin).toBe(0);
  });

  it('leaves the calculated side null outside the computed interval', () => {
    const series = comparePrimaryMeasurements(dataset([
      { timeMin: -1, value: 1 }, { timeMin: 99, value: 1 }]), points)[0];
    expect(series.points.every(p => p.calculated === null)).toBe(true);
    expect(series.overlaps).toBe(false);
    expect(series.notes.join(' ')).toContain('não se sobrepõem');
  });

  it('does not bridge a gap longer than the declared limit', () => {
    const sparse = [point(0, 0), point(20, 5)];
    const series = comparePrimaryMeasurements(dataset([{ timeMin: 10, value: 4 }]), sparse)[0];
    expect(series.points[0].calculated).toBeNull();
    expect(series.points[0].difference).toBeNull();
    // Com limite maior que a lacuna, a amostragem volta a valer.
    const permissive = comparePrimaryMeasurements(
      dataset([{ timeMin: 10, value: 4 }], { maxInterpolationGapMin: 60 }), sparse)[0];
    expect(permissive.points[0].calculated).toBeCloseTo(2.5, 9);
  });

  it('refuses to interpolate through an outside-model stretch or a stage change', () => {
    const interrupted = [point(0, 0), point(2, 5),
      point(4, null, { state: 'outside-model' }), point(6, 5)];
    const series = comparePrimaryMeasurements(dataset([{ timeMin: 3, value: 4 }]), interrupted)[0];
    expect(series.points[0].calculated).toBeNull();

    const staged = [point(0, 0), point(2, 5), point(4, 5, { stageId: 'stage-2' })];
    const across = comparePrimaryMeasurements(dataset([{ timeMin: 3, value: 4 }]), staged)[0];
    expect(across.points[0].calculated).toBeNull();
  });

  it('keeps a missing measurement as a gap instead of a zero', () => {
    const series = comparePrimaryMeasurements(dataset([
      { timeMin: 2, value: 4 }, { timeMin: 3, value: null }, { timeMin: 4, value: 5 }]), points)[0];
    expect(series.points.map(p => p.measured)).toEqual([4, null, 5]);
    expect(series.points[1].difference).toBeNull();
  });

  it('says plainly when a quantity has no calculated counterpart', () => {
    const local = dataset([{ timeMin: 2, value: 12 }], {
      channels: [{ id: 'retorno', name: 'Densidade local', location: 'Anular',
        quantity: 'local-density', unit: 'ppg', referenceMD: 1000 }] });
    const series = comparePrimaryMeasurements(local, points)[0];
    expect(series.points.every(p => p.calculated === null)).toBe(true);
    expect(series.notes.join(' ')).toContain('Sem série calculada');
  });

  it('summarises the residual only where both sides exist', () => {
    const series = comparePrimaryMeasurements(dataset([
      { timeMin: 2, value: 6 }, { timeMin: 4, value: 4 }, { timeMin: 99, value: 9 }]), points)[0];
    const summary = primaryResidualSummary(series);
    expect(summary.pairs).toBe(2);
    expect(summary.meanDifference).toBeCloseTo(0, 9);
    expect(summary.maxAbsDifference).toBeCloseTo(1, 9);
    expect(primaryResidualSummary({ ...series, points: [] }).meanDifference).toBeNull();
  });

  it('does not change the calculated points it was given', () => {
    const original = structuredClone(points);
    comparePrimaryMeasurements(dataset([{ timeMin: 3, value: 4 }]), points);
    expect(points).toEqual(original);
  });
});
