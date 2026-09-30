import { describe, expect, it } from 'vitest';
import { primaryContractExample } from '../models/primary-cementing.examples';
import type { PrimaryPumpStep } from '../models/primary-cementing.model';
import type { PrimaryScenario } from '../models/primary-scenario.model';
import type { PrimaryProgramVolumes } from '../models/primary-volumes.model';
import { buildWellGeometry } from '../models/well-geometry.form';
import { simulatePrimaryTransport } from './primary-transport';
import { resolvePrimaryProgramVolumes } from './primary-volumes';
import { WellGeometryService } from './well-geometry.service';

const C = 0.0031871;
const service = new WellGeometryService();
const geometryOf = (s: PrimaryScenario) => service.resolvePrimaryStageGeometry(
  buildWellGeometry(s.wellFinalMD, s.wellFinalTVD, s.fases), s.primary);
const run = (s: PrimaryScenario) => {
  const geometry = geometryOf(s);
  return simulatePrimaryTransport(s.primary, geometry, resolvePrimaryProgramVolumes(s.primary, geometry));
};
const held = (result: ReturnType<typeof run>, fluidId: string) =>
  result.inventory.find(i => i.fluidId === fluidId)!;

/** Caso base da SPEC §11.1, com o programa completo de pasta e deslocamento. */
function baseCase(): PrimaryScenario {
  const s = primaryContractExample('conventional');
  s.fases = [{ id: 'open', name: 'Poço aberto', type: 'OPEN_HOLE', topMD: 0, topTVD: 0,
    bottomMD: 1500, bottomTVD: 1500, holeDiameterIn: 8.5,
    casingOD: null, casingID: null, shoeMD: null, shoeTVD: null }];
  const p = s.primary;
  p.assemblies = [{ id: 'target', name: 'target', role: 'target-casing',
    sections: [{ id: 'target-section', topMD: 0, bottomMD: 1500, idIn: 6.276, odIn: 7 }] }];
  p.target = { kind: 'conventional', casingAssemblyId: 'target', floatCollarMD: 1480, shoeMD: 1500 };
  p.outerBoundaries = [{ id: 'outer-hole', kind: 'open-hole', topMD: 0, bottomMD: 1500,
    phaseId: 'open', diameter: { source: 'nominal', excessFraction: 0 } }];
  p.devices = [{ id: 'collar', name: 'Colar', kind: 'float-collar', assemblyId: 'target',
    outletMD: 1500, seatMD: 1480, launchMD: 0, initialState: 'open' }];
  p.retainedVolumes = [{ id: 'track', kind: 'shoe-track', assemblyId: 'target', zone: 'internal',
    topMD: 1480, bottomMD: 1500 }];
  p.paths = [{ id: 'shoe-path', name: 'Circulação pela sapata', legs: [
    { id: 'in', zone: 'internal', assemblyId: 'target', topMD: 0, bottomMD: 1500, direction: 'down' },
    { id: 'out', zone: 'casing-annulus', assemblyId: 'target', topMD: 0, bottomMD: 1500, direction: 'up' },
  ] }];
  p.stages = [{ id: 'stage-1', name: 'Estágio 1', deviceId: 'collar', outletMD: 1500, seatMD: 1480,
    targetTocMD: 500, activePathId: 'shoe-path',
    placements: [{ id: 'cement-1', fluidId: 'cement', topMD: 500, bottomMD: 1500, retainedVolumeIds: ['track'] }],
    steps: [
      { id: 's1-cement', kind: 'pump', fluidId: 'cement', rateBpm: 5, quantity: { source: 'placement', placementId: 'cement-1', fraction: 1 } },
      { id: 's1-launch', kind: 'tool-event', deviceId: 'collar', action: 'launch-top' },
      { id: 's1-displace', kind: 'pump', fluidId: 'displacement', rateBpm: 5, quantity: { source: 'displacement', deviceId: 'collar', fraction: 1 } },
    ] }];
  s.wellFinalMD = s.wellFinalTVD = 1500;
  return s;
}

describe('primary fluid transport, exact events and conservation (P5)', () => {
  it('reproduces the isolated transport case of the SPEC', () => {
    // Capacidades escolhidas para valer exatamente 100 bbl internos e 80 anulares.
    const shoe = 1000;
    const s = baseCase();
    const idIn = Math.sqrt(100 / (C * shoe));
    const holeIn = Math.sqrt(7 ** 2 + 80 / (C * shoe));
    s.wellFinalMD = s.wellFinalTVD = shoe;
    s.fases = [{ ...s.fases[0], bottomMD: shoe, bottomTVD: shoe, holeDiameterIn: holeIn }];
    s.primary.assemblies = [{ id: 'target', name: 'target', role: 'target-casing',
      sections: [{ id: 'target-section', topMD: 0, bottomMD: shoe, idIn, odIn: 7 }] }];
    s.primary.target = { kind: 'conventional', casingAssemblyId: 'target', floatCollarMD: 980, shoeMD: shoe };
    s.primary.outerBoundaries = [{ ...s.primary.outerBoundaries[0], bottomMD: shoe }];
    s.primary.devices = [{ ...s.primary.devices[0], outletMD: shoe, seatMD: 980 }];
    s.primary.retainedVolumes = [{ id: 'track', kind: 'shoe-track', assemblyId: 'target', zone: 'internal',
      topMD: 980, bottomMD: shoe }];
    s.primary.paths[0].legs = [
      { id: 'in', zone: 'internal', assemblyId: 'target', topMD: 0, bottomMD: shoe, direction: 'down' },
      { id: 'out', zone: 'casing-annulus', assemblyId: 'target', topMD: 0, bottomMD: shoe, direction: 'up' }];
    s.primary.fluids.push({ ...s.primary.fluids[0], id: 'spacer', kind: 'spacer', name: 'spacer' });
    const steps: PrimaryPumpStep[] = [
      { id: 't-spacer', kind: 'pump', fluidId: 'spacer', rateBpm: 10, quantity: { source: 'entered', volumeBbl: 10 } },
      { id: 't-cement', kind: 'pump', fluidId: 'cement', rateBpm: 10, quantity: { source: 'entered', volumeBbl: 50 } },
      { id: 't-displace', kind: 'pump', fluidId: 'displacement', rateBpm: 10, quantity: { source: 'entered', volumeBbl: 60 } },
    ];
    s.primary.stages = [{ ...s.primary.stages[0], outletMD: shoe, seatMD: 980,
      placements: [{ id: 'cement-1', fluidId: 'cement', topMD: 500, bottomMD: shoe, retainedVolumeIds: ['track'] }],
      steps }];
    // Transporte isolado: o programa é dado, sem dimensionar por TOC nem lançar plugue.
    const program: PrimaryProgramVolumes = { stages: [{ stageId: 'stage-1', targetTocMD: 500, outletMD: shoe,
      placements: [], steps: steps.map(step => ({ stageId: 'stage-1', stepId: step.id, kind: 'pump' as const,
        fluidId: step.kind === 'pump' ? step.fluidId : null, source: 'entered' as const, placementId: null,
        fraction: null, volumeBbl: step.id === 't-spacer' ? 10 : step.id === 't-cement' ? 50 : 60,
        rateBpm: 10, durationMin: 1 })),
      cementPlannedBbl: 0, cementProgrammedBbl: 50, displacementTargetBbl: 0, displacementProgrammedBbl: 0,
      displacementFractionSum: 0, totalPumpedBbl: 120, totalTimeMin: 12, idealToc: null }],
      totalPumpedBbl: 120, totalCementPlannedBbl: 0, totalCementProgrammedBbl: 50, totalTimeMin: 12,
      valid: true, diagnostics: [] };

    const result = simulatePrimaryTransport(s.primary, geometryOf(s), program);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(result.totalPumpedBbl).toBeCloseTo(120, 9);
    expect(held(result, 'mud').returnedBbl).toBeCloseTo(120, 8);
    expect(held(result, 'displacement').internalBbl).toBeCloseTo(60, 8);
    expect(held(result, 'cement').internalBbl).toBeCloseTo(40, 8);
    expect(held(result, 'cement').annularBbl).toBeCloseTo(10, 8);
    expect(held(result, 'spacer').annularBbl).toBeCloseTo(10, 8);
    expect(held(result, 'mud').annularBbl).toBeCloseTo(60, 8);
    const inWell = result.inventory.reduce((sum, i) => sum + i.internalBbl + i.annularBbl, 0);
    expect(inWell).toBeCloseTo(180, 8);
  });

  it('closes the per-fluid balance in every snapshot, not only at the end', () => {
    const result = run(baseCase());
    expect(result.snapshots.length).toBeGreaterThan(3);
    for (const snapshot of result.snapshots)
      for (const entry of snapshot.inventory)
        expect(Math.abs(entry.balanceErrorBbl)).toBeLessThan(1e-8);
  });

  it('places the sheath at the planned top with a full track and no cement returned', () => {
    const result = run(baseCase());
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(result.totalPumpedBbl).toBeCloseTo(262.401158594400, 8);
    expect(held(result, 'mud').returnedBbl).toBeCloseTo(262.401158594400, 8);
    expect(held(result, 'cement').returnedBbl).toBe(0);
    expect(held(result, 'cement').annularBbl).toBeCloseTo(74.100075, 8);
    expect(held(result, 'cement').internalBbl).toBeCloseTo(2.510681114592, 8);
    const placement = result.placements[0];
    expect(placement.actualTocMD).toBeCloseTo(500, 6);
    expect(placement.fragmented).toBe(false);
    expect(placement.actualIntervals).toHaveLength(1);
    expect(placement.actualIntervals[0].bottomMD).toBeCloseTo(1500, 6);
  });

  it('marks the exact events instead of interpolating them', () => {
    const result = run(baseCase());
    const kinds = result.events.map(e => e.kind);
    expect(kinds).toContain('top-plug-launched');
    expect(kinds).toContain('interface-at-outlet');
    expect(kinds).toContain('top-plug-landed');
    const landed = result.events.find(e => e.kind === 'top-plug-landed')!;
    expect(landed.md).toBe(1480);
    expect(landed.timeMin).toBeCloseTo(262.401158594400 / 5, 8);
    const outlet = result.events.find(e => e.kind === 'interface-at-outlet')!;
    // A pasta chega à sapata quando o interior inteiro já foi bombeado.
    expect(outlet.md).toBe(1500);
    expect(outlet.timeMin).toBeCloseTo(188.301083594400 / 5, 8);
    expect(outlet.fluidId).toBe('cement');
    for (const event of result.events) expect(Number.isFinite(event.timeMin)).toBe(true);
  });

  it('stops at seating and refuses to push fluid through a closed plug', () => {
    const scenario = baseCase();
    scenario.primary.stages[0].steps.push({ id: 's1-extra', kind: 'pump', fluidId: 'displacement',
      rateBpm: 5, quantity: { source: 'entered', volumeBbl: 20 } });
    const result = run(scenario);
    expect(result.status).toBe('partial');
    const over = result.diagnostics.find(d => d.code === 'PRIMARY_OVERDISPLACEMENT')!;
    expect(over.severity).toBe('warning');
    expect(over.value).toBeCloseTo(20, 8);
    // Nada atravessou o plugue: o transporte é o mesmo do programa sem o excedente.
    expect(result.totalPumpedBbl).toBeCloseTo(262.401158594400, 8);
    expect(held(result, 'mud').returnedBbl).toBeCloseTo(262.401158594400, 8);
  });

  it('leaves cement inside the casing when the displacement is short', () => {
    const scenario = baseCase();
    const displace = scenario.primary.stages[0].steps[2];
    if (displace.kind !== 'pump') throw Error('fixture');
    displace.quantity = { source: 'displacement', deviceId: 'collar', fraction: 0.9 };
    const result = run(scenario);
    const short = result.diagnostics.find(d => d.code === 'PRIMARY_UNDERDISPLACEMENT')!;
    expect(short.severity).toBe('warning');
    expect(short.md).toBeLessThan(1480);
    expect(held(result, 'cement').internalBbl).toBeGreaterThan(2.510681114592);
    expect(result.placements[0].actualTocMD).toBeGreaterThan(500);
  });

  it('shows a split pumping order as separate pockets, not a continuous sheath', () => {
    const scenario = baseCase();
    scenario.primary.stages[0].steps = [
      { id: 's1-cement-a', kind: 'pump', fluidId: 'cement', rateBpm: 5, quantity: { source: 'placement', placementId: 'cement-1', fraction: 0.5 } },
      { id: 's1-gap', kind: 'pump', fluidId: 'displacement', rateBpm: 5, quantity: { source: 'entered', volumeBbl: 20 } },
      { id: 's1-cement-b', kind: 'pump', fluidId: 'cement', rateBpm: 5, quantity: { source: 'placement', placementId: 'cement-1', fraction: 0.5 } },
      { id: 's1-launch', kind: 'tool-event', deviceId: 'collar', action: 'launch-top' },
      { id: 's1-displace', kind: 'pump', fluidId: 'displacement', rateBpm: 5, quantity: { source: 'displacement', deviceId: 'collar', fraction: 1 } },
    ];
    const result = run(scenario);
    const placement = result.placements[0];
    expect(placement.fragmented).toBe(true);
    expect(placement.actualIntervals.length).toBeGreaterThan(1);
    expect(result.diagnostics.map(d => d.code)).toContain('PRIMARY_PLACEMENT_FRAGMENTED');
    // O total de pasta continua o dimensionado; o que mudou foi onde ela ficou.
    expect(held(result, 'cement').pumpedBbl).toBeCloseTo(76.610756114592, 8);
  });

  it('carries inventory and the clock across a stage change without refilling with mud', () => {
    const result = run(primaryContractExample('two-stage'));
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const opened = result.events.find(e => e.kind === 'stage-opened')!;
    expect(opened.timeMin).toBeGreaterThan(0);
    const before = result.snapshots.filter(s => s.timeMin <= opened.timeMin).at(-1)!;
    const after = result.snapshots.find(s => s.timeMin >= opened.timeMin && s.reason === 'event')!;
    const cementAt = (snapshot: typeof before) =>
      snapshot.inventory.find(i => i.fluidId === 'cement')!.annularBbl;
    expect(cementAt(after)).toBeCloseTo(cementAt(before), 8);
    expect(result.snapshots.at(-1)!.timeMin).toBeGreaterThan(opened.timeMin);
    for (const entry of result.inventory) expect(Math.abs(entry.balanceErrorBbl)).toBeLessThan(1e-8);
  });

  it('runs the liner dart and wiper as one travel counted a single time', () => {
    const scenario = primaryContractExample('liner');
    const result = run(scenario);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const kinds = result.events.map(e => e.kind);
    expect(kinds).toContain('dart-launched');
    expect(kinds).toContain('liner-wiper-released');
    expect(kinds).toContain('top-plug-landed');
    const released = result.events.find(e => e.kind === 'liner-wiper-released')!;
    expect(released.md).toBe(1000);
    expect(held(result, 'displacement').pumpedBbl).toBeCloseTo(162.287132, 6);
    const plugs = result.snapshots.at(-1)!.plugs;
    expect(plugs.find(p => p.kind === 'dart')!.state).toBe('landed-open');
    expect(plugs.find(p => p.kind === 'liner-wiper')!.state).toBe('landed-closed');
  });

  it('adds time without volume on a pause and refuses an out-of-order launch', () => {
    const paused = baseCase();
    paused.primary.stages[0].steps.splice(1, 0, { id: 's1-wait', kind: 'pause', durationMin: 7 });
    const withPause = run(paused);
    const plain = run(baseCase());
    expect(withPause.totalPumpedBbl).toBeCloseTo(plain.totalPumpedBbl, 9);
    expect(withPause.totalTimeMin).toBeCloseTo(plain.totalTimeMin + 7, 9);

    const wrongOrder = baseCase();
    wrongOrder.primary.stages[0].steps.unshift(
      { id: 's1-bottom', kind: 'tool-event', deviceId: 'collar', action: 'launch-bottom' });
    wrongOrder.primary.stages[0].steps.unshift(
      { id: 's1-top-early', kind: 'tool-event', deviceId: 'collar', action: 'launch-top' });
    expect(run(wrongOrder).diagnostics.map(d => d.code)).toContain('PRIMARY_TOOL_SEQUENCE');
  });
});
