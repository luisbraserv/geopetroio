import { describe, expect, it } from 'vitest';
import { primaryContractExample } from '../models/primary-cementing.examples';
import type { PrimaryScenario } from '../models/primary-scenario.model';
import type { PrimaryRateModel } from '../models/primary-transport.model';
import { buildWellGeometry } from '../models/well-geometry.form';
import { createPrimaryRateModel, resolvePrimaryHydraulics } from './primary-hydraulics';
import { simulatePrimaryTransport } from './primary-transport';
import { resolvePrimaryProgramVolumes } from './primary-volumes';
import { WellGeometryService } from './well-geometry.service';

/**
 * §7.5: transporte conservativo de queda livre. A coluna interna pode descer mais
 * rápido que o bombeio, abrindo vazio no topo; o balanço por fluido continua
 * fechando, o vazio nunca fica negativo e o circuito volta a encher.
 */
const service = new WellGeometryService();

/** Caso base de §11.1 com um programa de lama escolhido por cada teste. */
function mudOnly(steps: PrimaryScenario['primary']['stages'][number]['steps']): PrimaryScenario {
  const s = primaryContractExample('conventional');
  s.fases = [{ id: 'open', name: 'Poço aberto', type: 'OPEN_HOLE', topMD: 0, topTVD: 0,
    bottomMD: 1500, bottomTVD: 1500, holeDiameterIn: 8.5, casingOD: null, casingID: null, shoeMD: null, shoeTVD: null }];
  const p = s.primary;
  p.assemblies = [{ id: 'target', name: 'target', role: 'target-casing',
    sections: [{ id: 'target-section', topMD: 0, bottomMD: 1500, idIn: 6.276, odIn: 7 }] }];
  p.target = { kind: 'conventional', casingAssemblyId: 'target', floatCollarMD: 1480, shoeMD: 1500 };
  p.outerBoundaries = [{ id: 'outer-hole', kind: 'open-hole', topMD: 0, bottomMD: 1500,
    phaseId: 'open', diameter: { source: 'nominal', excessFraction: 0 } }];
  p.devices = [{ id: 'collar', name: 'Colar', kind: 'float-collar', assemblyId: 'target',
    outletMD: 1500, seatMD: 1480, launchMD: 0, initialState: 'open' }];
  p.retainedVolumes = [{ id: 'track', kind: 'shoe-track', assemblyId: 'target', zone: 'internal', topMD: 1480, bottomMD: 1500 }];
  p.paths = [{ id: 'shoe-path', name: 'Circulação pela sapata', legs: [
    { id: 'in', zone: 'internal', assemblyId: 'target', topMD: 0, bottomMD: 1500, direction: 'down' },
    { id: 'out', zone: 'casing-annulus', assemblyId: 'target', topMD: 0, bottomMD: 1500, direction: 'up' },
  ] }];
  p.stages = [{ id: 'stage-1', name: 'Estágio 1', deviceId: 'collar', outletMD: 1500, seatMD: 1480,
    targetTocMD: 500, activePathId: 'shoe-path',
    placements: [{ id: 'cement-1', fluidId: 'cement', topMD: 500, bottomMD: 1500, retainedVolumeIds: ['track'] }],
    steps: [
      ...steps,
      { id: 'cement', kind: 'pump', fluidId: 'cement', rateBpm: 5, quantity: { source: 'placement', placementId: 'cement-1', fraction: 1 } },
    ] }];
  s.wellFinalMD = s.wellFinalTVD = 1500;
  return s;
}

function transportOf(s: PrimaryScenario, rateModel?: PrimaryRateModel) {
  const well = buildWellGeometry(s.wellFinalMD, s.wellFinalTVD, s.fases);
  const geometry = service.resolvePrimaryStageGeometry(well, s.primary);
  const tvdOf = service.mdToTvdResolver(well);
  const transport = simulatePrimaryTransport(s.primary, geometry, resolvePrimaryProgramVolumes(s.primary, geometry),
    { rateModel: rateModel ?? createPrimaryRateModel(s.primary, geometry, tvdOf) });
  return { transport, geometry, tvdOf };
}

const balanced = (snapshots: { inventory: { balanceErrorBbl: number }[] }[]) =>
  snapshots.every(s => s.inventory.every(i => Math.abs(i.balanceErrorBbl) < 1e-8));

describe('queda livre conservativa (§7.5)', () => {
  it('fecha o balanço isolado da SPEC: entram 2 bbl, saem 4 bbl e o vazio cresce 2 bbl', () => {
    // §11.2: durante 1 min, Q_bomba = 2 bpm e Q_sapata = Q_retorno = 4 bpm.
    const scenario = mudOnly([{ id: 'a', kind: 'pump', fluidId: 'mud', rateBpm: 2, quantity: { source: 'entered', volumeBbl: 2 } }]);
    const prescribed: PrimaryRateModel = state => state.sealed ? { regime: 'landed', outletRateBpm: 0 }
      : state.pumpRateBpm === 2 ? { regime: 'free-fall', outletRateBpm: 4 }
        : { regime: state.pumpRateBpm > 0 ? 'full' : 'static', outletRateBpm: state.pumpRateBpm };
    const { transport } = transportOf(scenario, prescribed);
    const endOfA = transport.snapshots.find(s => s.stepId === 'a' && s.reason === 'step-end')!;
    expect(endOfA.timeMin).toBeCloseTo(1, 12);
    expect(endOfA.voidBbl).toBeCloseTo(2, 9);
    const mud = endOfA.inventory.find(i => i.fluidId === 'mud')!;
    expect(mud.pumpedBbl).toBeCloseTo(2, 12);
    expect(mud.returnedBbl).toBeCloseTo(4, 9);
    // O vazio fica no topo do interno, acima do líquido.
    expect(endOfA.voids![0].topMD).toBe(0);
    expect(balanced(transport.snapshots)).toBe(true);
  });

  it('reenche o vazio sem deixá-lo negativo e volta ao circuito cheio', () => {
    const scenario = mudOnly([
      { id: 'a', kind: 'pump', fluidId: 'mud', rateBpm: 2, quantity: { source: 'entered', volumeBbl: 2 } },
      { id: 'b', kind: 'pump', fluidId: 'mud', rateBpm: 2, quantity: { source: 'entered', volumeBbl: 5 } },
    ]);
    let seenVoid = false;
    const prescribed: PrimaryRateModel = state => {
      if (state.sealed) return { regime: 'landed', outletRateBpm: 0 };
      if (!seenVoid && state.pumpRateBpm === 2 && state.voidBbl < 2 - 1e-9) return { regime: 'free-fall', outletRateBpm: 4 };
      if (state.voidBbl > 1e-9) { seenVoid = true; return { regime: 'free-fall', outletRateBpm: 0 }; }
      return { regime: state.pumpRateBpm > 0 ? 'full' : 'static', outletRateBpm: state.pumpRateBpm };
    };
    const { transport } = transportOf(scenario, prescribed);
    const endOfB = transport.snapshots.find(s => s.stepId === 'b' && s.reason === 'step-end')!;
    const mud = endOfB.inventory.find(i => i.fluidId === 'mud')!;
    // 2 bbl bombeados e 4 retornados em a; em b, 2 bbl enchem o vazio e 3 saem.
    expect(mud.pumpedBbl).toBeCloseTo(7, 9);
    expect(mud.returnedBbl).toBeCloseTo(7, 9);
    expect(endOfB.voidBbl).toBeLessThan(1e-9);
    const refilled = transport.snapshots.filter(s => s.stepId === 'b').map(s => s.voidBbl ?? 0);
    for (let i = 1; i < refilled.length; i++) expect(refilled[i]).toBeLessThanOrEqual(refilled[i - 1] + 1e-12);
    expect(Math.min(...transport.snapshots.map(s => s.voidBbl ?? 0))).toBeGreaterThanOrEqual(0);
    expect(endOfB.flowRegime).toBe('full');
    expect(balanced(transport.snapshots)).toBe(true);
  });

  it('lança o plugue sobre o vazio: ele cai até o líquido e desce com ele', () => {
    const scenario = mudOnly([
      { id: 'a', kind: 'pump', fluidId: 'mud', rateBpm: 2, quantity: { source: 'entered', volumeBbl: 2 } },
      { id: 'top', kind: 'tool-event', deviceId: 'collar', action: 'launch-top' },
    ]);
    const prescribed: PrimaryRateModel = state => state.sealed ? { regime: 'landed', outletRateBpm: 0 }
      : state.pumpRateBpm === 2 ? { regime: 'free-fall', outletRateBpm: 4 }
        : { regime: state.pumpRateBpm > 0 ? 'full' : 'static', outletRateBpm: state.pumpRateBpm };
    const { transport } = transportOf(scenario, prescribed);
    const launched = transport.snapshots.find(s => s.reason === 'event' && s.plugs.some(p => p.kind === 'top'))!;
    const plug = launched.plugs.find(p => p.kind === 'top')!;
    // 2 bbl de vazio no revestimento de 6,276": o topo do líquido está a 2/(C·6,276²) m.
    expect(plug.md).toBeCloseTo(2 / (0.0031871 * 6.276 ** 2), 6);
    expect(plug.md).toBeCloseTo(launched.voids![0].bottomMD, 6);
  });

  it('drena na pausa quando o interno está mais pesado que o anular', () => {
    // Pasta pesada dentro, lama leve fora: parar a bomba não congela o poço.
    const scenario = mudOnly([]);
    scenario.primary.stages[0].steps.push({ id: 'pause', kind: 'pause', durationMin: 10 });
    const { transport } = transportOf(scenario);
    const pause = transport.snapshots.filter(s => s.stepId === 'pause');
    expect(pause.length).toBeGreaterThan(2);
    const first = pause[0];
    const last = pause.at(-1)!;
    const returned = (s: typeof first) => s.inventory.reduce((sum, i) => sum + i.returnedBbl, 0);
    const pumped = (s: typeof first) => s.inventory.reduce((sum, i) => sum + i.pumpedBbl, 0);
    expect(pumped(last)).toBeCloseTo(pumped(first), 12);
    expect(returned(last)).toBeGreaterThan(returned(first));
    expect(last.voidBbl!).toBeGreaterThan(first.voidBbl ?? 0);
    expect(pause.some(s => s.flowRegime === 'free-fall' && (s.outletRateBpm ?? 0) > 0)).toBe(true);
    expect(balanced(transport.snapshots)).toBe(true);
  });

  it('para no primeiro estado fora do modelo, sem inventar o resto do programa', () => {
    const scenario = mudOnly([{ id: 'a', kind: 'pump', fluidId: 'mud', rateBpm: 2, quantity: { source: 'entered', volumeBbl: 2 } }]);
    const prescribed: PrimaryRateModel = state => state.pumpRateBpm === 5
      ? { regime: 'outside-model', reason: 'TEST_OUTSIDE', message: 'Fora do modelo no teste.' }
      : { regime: state.pumpRateBpm > 0 ? 'full' : 'static', outletRateBpm: state.pumpRateBpm };
    const { transport, geometry, tvdOf } = transportOf(scenario, prescribed);
    expect(transport.halted).toBe(true);
    expect(transport.status).toBe('partial');
    expect(transport.events.at(-1)!.kind).toBe('outside-model');
    expect(transport.snapshots.at(-1)!.flowRegime).toBe('outside-model');
    expect(transport.snapshots.some(s => s.reason === 'end')).toBe(false);
    expect(transport.diagnostics.map(d => d.code)).toContain('TEST_OUTSIDE');
    const hydraulics = resolvePrimaryHydraulics(scenario.primary, geometry, transport, tvdOf);
    expect(hydraulics.points.at(-1)!.state).toBe('outside-model');
    expect(hydraulics.points.at(-1)!.bhpPsi).toBeNull();
    expect(hydraulics.status).toBe('partial');
  });

  it('dá o mesmo resultado do transporte de P5 quando não há queda livre', () => {
    // Pasta mais leve que a lama: o circuito fica cheio o tempo todo.
    const scenario = mudOnly([]);
    scenario.primary.fluids.find(f => f.id === 'mud')!.densityPpg = 16;
    scenario.primary.fluids.find(f => f.id === 'cement')!.densityPpg = 12;
    const coupled = transportOf(scenario).transport;
    const well = buildWellGeometry(scenario.wellFinalMD, scenario.wellFinalTVD, scenario.fases);
    const geometry = service.resolvePrimaryStageGeometry(well, scenario.primary);
    const plain = simulatePrimaryTransport(scenario.primary, geometry, resolvePrimaryProgramVolumes(scenario.primary, geometry));
    expect(coupled.snapshots.every(s => s.flowRegime !== 'free-fall')).toBe(true);
    expect(coupled.totalTimeMin).toBeCloseTo(plain.totalTimeMin, 9);
    for (const entry of plain.inventory) {
      const same = coupled.inventory.find(i => i.fluidId === entry.fluidId)!;
      for (const key of ['pumpedBbl', 'internalBbl', 'annularBbl', 'returnedBbl'] as const)
        expect(same[key]).toBeCloseTo(entry[key], 8);
    }
    for (const placement of plain.placements) {
      const same = coupled.placements.find(p => p.placementId === placement.placementId)!;
      expect(same.actualTocMD!).toBeCloseTo(placement.actualTocMD!, 6);
    }
  });
});
