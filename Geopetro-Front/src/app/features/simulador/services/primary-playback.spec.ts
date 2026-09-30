import { describe, expect, it } from 'vitest';
import type { PrimaryEvent, PrimaryHydraulicPoint } from '../models/primary-cementing.model';
import type { PrimaryFullSnapshot } from '../models/primary-hydraulics.model';
import { advancePrimaryTime, nextPrimaryEventTime, previousPrimaryEventTime,
  primaryEventLabel, selectPrimaryInstant } from './primary-playback';

const snapshot = (timeMin: number, stepId: string | null): PrimaryFullSnapshot => ({
  timeMin, stageId: 'stage-1', activePathId: 'path', parcels: [], devices: [], plugs: [],
  inventory: [], profiles: [], reason: 'step-end', stepId, pumpRateBpm: 5, activeOutletMD: 1500,
});
const point = (timeMin: number, stepId: string | null): PrimaryHydraulicPoint => ({
  timeMin, stageId: 'stage-1', stepId, phase: 'pump', pumpedVolumeBbl: timeMin * 5,
  cementPumpedVolumeBbl: 0, returnedVolumeBbl: 0, cementReturnedBbl: 0, activeOutletMD: 1500,
  pumpRateBpm: 5, outletRateBpm: 5, returnRateBpm: 5, inletDensityPpg: 10,
  requiredPumpPressurePsi: 100, pumpPressurePsi: 100, annularHydrostaticPsi: 1,
  internalHydrostaticPsi: 1, pipeFrictionPsi: 1, annularFrictionPsi: 1, localLossPsi: 0,
  referenceId: 'outlet', bhpPsi: 1, ecdPpg: 10, porePsi: null, fracturePsi: null,
  voidVolumeBbl: null, uTubeDrivePsi: 0, state: 'full', references: [],
});
const events: PrimaryEvent[] = [
  { timeMin: 5, stageId: 'stage-1', stepId: 's1', kind: 'top-plug-launched', md: 0 },
  { timeMin: 12, stageId: 'stage-1', stepId: 's2', kind: 'interface-at-outlet', md: 1500 },
];

describe('primary playback over already calculated results (P7)', () => {
  const snapshots = [snapshot(0, null), snapshot(5, 's1'), snapshot(12, 's2'), snapshot(20, 's3')];
  const points = [point(0, null), point(5, 's1'), point(12, 's2'), point(20, 's3')];

  it('holds the last valid snapshot between events instead of interpolating', () => {
    const between = selectPrimaryInstant(snapshots, points, events, 8.4);
    expect(between.snapshot!.timeMin).toBe(5);
    expect(between.point!.timeMin).toBe(5);
    // Nenhum evento é atribuído a um instante que não é o dele.
    expect(between.events).toEqual([]);
  });

  it('reports the events that happen exactly at the selected instant', () => {
    const exact = selectPrimaryInstant(snapshots, points, events, 12);
    expect(exact.snapshot!.timeMin).toBe(12);
    expect(exact.events.map(e => e.kind)).toEqual(['interface-at-outlet']);
  });

  it('clamps before the first sample and after the last one', () => {
    expect(selectPrimaryInstant(snapshots, points, events, -3).snapshot!.timeMin).toBe(0);
    expect(selectPrimaryInstant(snapshots, points, events, 999).snapshot!.timeMin).toBe(20);
    expect(selectPrimaryInstant([], [], [], 1).snapshot).toBeNull();
    expect(selectPrimaryInstant(snapshots, points, events, Number.NaN).snapshot).toBeNull();
  });

  it('navigates between events in both directions', () => {
    expect(nextPrimaryEventTime(events, 0)).toBe(5);
    expect(nextPrimaryEventTime(events, 5)).toBe(12);
    expect(nextPrimaryEventTime(events, 12)).toBeNull();
    expect(previousPrimaryEventTime(events, 12)).toBe(5);
    expect(previousPrimaryEventTime(events, 5)).toBeNull();
  });

  it('stops exactly on the next event instead of stepping over it', () => {
    // 1 s a 20x avançaria 20 min e passaria por cima dos dois eventos.
    expect(advancePrimaryTime(events, 0, 1, 20, 20)).toBe(5);
    expect(advancePrimaryTime(events, 5, 1, 20, 20)).toBe(12);
    // Sem evento à frente, avança livremente até o fim.
    expect(advancePrimaryTime(events, 12, 1, 20, 20)).toBe(20);
    expect(advancePrimaryTime(events, 0, 0.1, 20, 20)).toBeCloseTo(2, 12);
    expect(advancePrimaryTime(events, 3, 0, 20, 20)).toBe(3);
  });

  it('translates event codes into readable labels', () => {
    expect(primaryEventLabel('top-plug-landed')).toBe('Plugue superior assentado');
    expect(primaryEventLabel('liner-wiper-released')).toBe('Plugue do liner liberado');
  });
});
