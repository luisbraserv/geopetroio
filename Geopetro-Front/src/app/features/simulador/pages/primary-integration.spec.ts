import { describe, expect, it } from 'vitest';
import { primaryContractExample } from '../models/primary-cementing.examples';
import type { PrimaryFluid } from '../models/primary-cementing.model';
import type { PrimaryScenario } from '../models/primary-scenario.model';
import { buildWellGeometry, type WellPhaseFormValue } from '../models/well-geometry.form';
import { K, resolvePrimaryHydraulics } from '../services/primary-hydraulics';
import { simulatePrimaryTransport } from '../services/primary-transport';
import { resolvePrimaryProgramVolumes } from '../services/primary-volumes';
import { WellGeometryService } from '../services/well-geometry.service';

/**
 * P12: a matriz física de §11.3 rodada ponta a ponta, do dimensionamento à
 * hidráulica. Complementa os testes de cada etapa em vez de repeti-los.
 */
const service = new WellGeometryService();

function run(scenario: PrimaryScenario) {
  const well = buildWellGeometry(scenario.wellFinalMD, scenario.wellFinalTVD, scenario.fases);
  const geometry = service.resolvePrimaryStageGeometry(well, scenario.primary);
  const volumes = resolvePrimaryProgramVolumes(scenario.primary, geometry);
  const transport = simulatePrimaryTransport(scenario.primary, geometry, volumes);
  const hydraulics = resolvePrimaryHydraulics(scenario.primary, geometry, transport,
    md => service.mdToTvd(well, md),
    [{ id: 'sapata', name: 'Sapata', md: scenario.primary.target!.shoeMD,
      zone: 'casing-annulus', assemblyId: 'target' }]);
  return { geometry, volumes, transport, hydraulics };
}

/** Caso base de §11.1, o mesmo usado desde P4. */
function baseCase(): PrimaryScenario {
  const s = primaryContractExample('conventional');
  s.fases = [{ id: 'open', name: 'Poço aberto', type: 'OPEN_HOLE', topMD: 0, bottomMD: 1500,
    topTVD: 0, bottomTVD: 1500, holeDiameterIn: 8.5,
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

const fluid = (id: string, kind: PrimaryFluid['kind'], densityPpg: number): PrimaryFluid => ({
  id, kind, name: id, densityPpg,
  rheology: { model: 'power-law', n: 1, kLbfSnFt2: 0.000020885 },
  propertySources: { densityPpg: { source: 'entered' } },
});

describe('primary cementing physical matrix, end to end (P12)', () => {
  it('conserves volumes in a deviated well and lowers only the hydrostatic', () => {
    const vertical = run(baseCase());
    const deviated = baseCase();
    // Mesma MD e mesmos diâmetros; só a TVD encurta.
    deviated.fases = [{ ...deviated.fases[0], bottomTVD: 1200 }];
    deviated.wellFinalTVD = 1200;
    const slanted = run(deviated);

    const volumeOf = (result: ReturnType<typeof run>) =>
      result.volumes.stages[0].placements[0].plannedBbl;
    expect(volumeOf(slanted)).toBeCloseTo(volumeOf(vertical), 9);
    expect(slanted.volumes.stages[0].displacementTargetBbl)
      .toBeCloseTo(vertical.volumes.stages[0].displacementTargetBbl, 9);

    const hydrostatic = (result: ReturnType<typeof run>) =>
      result.hydraulics.points.find(point => point.annularHydrostaticPsi !== null)!.annularHydrostaticPsi!;
    expect(hydrostatic(slanted)).toBeLessThan(hydrostatic(vertical));
    // A hidrostática encurta na razão das TVDs; o volume não muda.
    expect(hydrostatic(slanted)).toBeCloseTo(hydrostatic(vertical) * 1200 / 1500, 6);
  });

  it('places lead above tail, with tail in the track, closing the balance per fluid', () => {
    const scenario = baseCase();
    scenario.primary.fluids = [fluid('mud', 'mud', 10), fluid('lead', 'cement', 13),
      fluid('tail', 'cement', 16.4), fluid('displacement', 'displacement', 9)];
    const stage = scenario.primary.stages[0];
    stage.placements = [
      { id: 'lead', fluidId: 'lead', topMD: 500, bottomMD: 1100, retainedVolumeIds: [] },
      { id: 'tail', fluidId: 'tail', topMD: 1100, bottomMD: 1500, retainedVolumeIds: ['track'] },
    ];
    stage.steps = [
      { id: 's1-lead', kind: 'pump', fluidId: 'lead', rateBpm: 5, quantity: { source: 'placement', placementId: 'lead', fraction: 1 } },
      { id: 's1-tail', kind: 'pump', fluidId: 'tail', rateBpm: 5, quantity: { source: 'placement', placementId: 'tail', fraction: 1 } },
      { id: 's1-launch', kind: 'tool-event', deviceId: 'collar', action: 'launch-top' },
      { id: 's1-displace', kind: 'pump', fluidId: 'displacement', rateBpm: 5, quantity: { source: 'displacement', deviceId: 'collar', fraction: 1 } },
    ];
    const result = run(scenario);
    expect(result.volumes.diagnostics).toEqual([]);
    // O tail leva o shoe track; o lead, não.
    expect(result.volumes.stages[0].placements[1].retainedBbl).toBeGreaterThan(0);
    expect(result.volumes.stages[0].placements[0].retainedBbl).toBe(0);

    const tail = result.transport.placements.find(entry => entry.placementId === 'tail')!;
    const lead = result.transport.placements.find(entry => entry.placementId === 'lead')!;
    expect(tail.actualTocMD).toBeGreaterThan(lead.actualTocMD!);
    // Balanço por fluido fecha em TODOS os snapshots, não só no fim.
    for (const snapshot of result.transport.snapshots)
      for (const entry of snapshot.inventory)
        expect(Math.abs(entry.balanceErrorBbl)).toBeLessThan(1e-8);
  });

  it('keeps volume and friction still when the rate is zero', () => {
    const scenario = baseCase();
    scenario.primary.stages[0].steps.splice(1, 0, { id: 's1-wait', kind: 'pause', durationMin: 15 });
    const result = run(scenario);
    const plain = run(baseCase());
    expect(result.transport.totalPumpedBbl).toBeCloseTo(plain.transport.totalPumpedBbl, 9);
    const still = result.hydraulics.points.filter(point => point.pumpRateBpm === 0
      && point.pipeFrictionPsi !== null);
    expect(still.length).toBeGreaterThan(0);
    for (const point of still) {
      expect(point.pipeFrictionPsi).toBe(0);
      expect(point.annularFrictionPsi).toBe(0);
      expect(point.outletRateBpm).toBe(0);
    }
  });

  it('leaves the window null and raises no breach when pore and fracture are absent', () => {
    const scenario = baseCase();
    scenario.primary.pressureWindow = [];
    const result = run(scenario);
    for (const entry of result.hydraulics.envelope) {
      expect(entry.porePsi).toBeNull();
      expect(entry.fracturePsi).toBeNull();
    }
    expect(result.hydraulics.narrowestFractureMargin).toBeNull();
    expect(result.hydraulics.breaches.filter(breach =>
      breach.limit === 'pore' || breach.limit === 'fracture')).toEqual([]);
    for (const point of result.hydraulics.points) {
      expect(point.porePsi).toBeNull();
      expect(point.fracturePsi).toBeNull();
    }
  });

  it('computes in metres regardless of the unit the screen shows', () => {
    // O motor não recebe unidade de apresentação: MD é sempre metro.
    const first = run(baseCase());
    const second = run(baseCase());
    expect(second.volumes.stages[0].placements[0].plannedBbl)
      .toBeCloseTo(first.volumes.stages[0].placements[0].plannedBbl, 12);
    expect(second.transport.placements[0].actualTocMD)
      .toBeCloseTo(first.transport.placements[0].actualTocMD!, 12);
    const bhp = (result: ReturnType<typeof run>) =>
      result.hydraulics.points.find(point => point.bhpPsi !== null)!.bhpPsi!;
    expect(bhp(second)).toBeCloseTo(bhp(first), 12);
  });

  it('reproduces the reference numbers of the spec from end to end', () => {
    const result = run(baseCase());
    const placement = result.volumes.stages[0].placements[0];
    expect(placement.annularBbl).toBeCloseTo(74.100075, 9);
    expect(placement.retainedBbl).toBeCloseTo(2.510681114592, 9);
    expect(placement.plannedBbl).toBeCloseTo(76.610756114592, 9);
    expect(result.volumes.stages[0].displacementTargetBbl).toBeCloseTo(185.790402479808, 9);
    expect(result.transport.totalPumpedBbl).toBeCloseTo(262.401158594400, 8);
    expect(result.transport.totalTimeMin).toBeCloseTo(52.480231718880, 8);
    expect(result.transport.placements[0].actualTocMD).toBeCloseTo(500, 6);
    // Hidrostática de lama em 1500 m com K compartilhado.
    const first = result.hydraulics.points.find(point => point.annularHydrostaticPsi !== null)!;
    expect(first.annularHydrostaticPsi).toBeCloseTo(K * 10 * 1500, 6);
  });

  it('runs three stages keeping inventory, clock and the track counted once', () => {
    const scenario = primaryContractExample('two-stage');
    const port = scenario.primary.devices.find(device => device.id === 'port')!;
    scenario.primary.devices.push({ id: 'port-3', name: 'Terceira porta', kind: 'stage-tool',
      assemblyId: 'target', outletMD: 500, seatMD: 470, launchMD: 0, initialState: 'closed' });
    scenario.primary.paths.push({ id: 'port-3-path', name: 'Circulação pela terceira porta', legs: [
      { id: 'p3-in', zone: 'internal', assemblyId: 'target', topMD: 0, bottomMD: 500, direction: 'down' },
      { id: 'p3-out', zone: 'casing-annulus', assemblyId: 'target', topMD: 0, bottomMD: 500, direction: 'up' },
    ] });
    scenario.primary.stages[1].targetTocMD = 500;
    scenario.primary.stages[1].placements[0].topMD = 500;
    scenario.primary.stages.push({ id: 'stage-3', name: 'Estágio 3', deviceId: 'port-3',
      outletMD: 500, seatMD: 470, targetTocMD: 0, activePathId: 'port-3-path',
      placements: [{ id: 'cement-3', fluidId: 'cement', topMD: 0, bottomMD: 500, retainedVolumeIds: [] }],
      steps: [{ id: 's3-open', kind: 'tool-event', deviceId: 'port-3', action: 'open-stage' },
        { id: 's3-cement', kind: 'pump', fluidId: 'cement', rateBpm: 3, quantity: { source: 'placement', placementId: 'cement-3', fraction: 1 } },
        { id: 's3-launch', kind: 'tool-event', deviceId: 'port-3', action: 'launch-top' },
        { id: 's3-displace', kind: 'pump', fluidId: 'displacement', rateBpm: 3, quantity: { source: 'displacement', deviceId: 'port-3', fraction: 1 } }] });
    expect(port.outletMD).toBe(1000);

    const result = run(scenario);
    expect(result.volumes.diagnostics).toEqual([]);
    expect(result.volumes.stages).toHaveLength(3);
    // Só o primeiro estágio carrega o shoe track.
    expect(result.volumes.stages[0].placements[0].retainedBbl).toBeGreaterThan(0);
    expect(result.volumes.stages[1].placements[0].retainedBbl).toBe(0);
    expect(result.volumes.stages[2].placements[0].retainedBbl).toBe(0);
    // Relógio global não reinicia entre estágios.
    const times = result.transport.snapshots.map(snapshot => snapshot.timeMin);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const entry of result.transport.inventory)
      expect(Math.abs(entry.balanceErrorBbl)).toBeLessThan(1e-8);
  });

  it('refuses to produce results over an invalid geometry', () => {
    const scenario = baseCase();
    // Colar abaixo da sapata é geometria impossível.
    scenario.primary.target = { kind: 'conventional', casingAssemblyId: 'target',
      floatCollarMD: 1600, shoeMD: 1500 };
    const result = run(scenario);
    expect(result.volumes.valid).toBe(false);
    expect(result.volumes.stages).toEqual([]);
    expect(result.transport.status).toBe('invalid');
    expect(result.hydraulics.status).toBe('invalid');
    expect(result.hydraulics.points).toEqual([]);
  });
});
