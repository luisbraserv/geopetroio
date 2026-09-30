import { describe, expect, it } from 'vitest';
import { primaryContractExample } from '../models/primary-cementing.examples';
import type { PrimaryScenario } from '../models/primary-scenario.model';
import { buildWellGeometry } from '../models/well-geometry.form';
import { resolvePrimaryProgramVolumes } from './primary-volumes';
import { WellGeometryService } from './well-geometry.service';

/** C e K da SPEC; os valores esperados são calculados fora do código testado. */
const C = 0.0031871;
const INTERNAL_BBL_M = C * 6.276 ** 2;
const ANNULAR_BBL_M = C * (8.5 ** 2 - 7 ** 2);

describe('primary program volumes, ideal TOC and reserves (P4)', () => {
  const service = new WellGeometryService();
  const resolve = (s: PrimaryScenario) => resolvePrimaryProgramVolumes(s.primary,
    service.resolvePrimaryStageGeometry(buildWellGeometry(s.wellFinalMD, s.wellFinalTVD, s.fases), s.primary));

  /** Caso base da SPEC §11.1: sapata 1500, colar 1480, TOC 500, caliper 8.5. */
  const baseCase = (): PrimaryScenario => {
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
    p.stages = [{ id: 'stage-1', name: 'Estágio 1', deviceId: 'collar', outletMD: 1500, seatMD: 1480,
      targetTocMD: 500, activePathId: 'shoe-path',
      placements: [{ id: 'cement-1', fluidId: 'cement', topMD: 500, bottomMD: 1500, retainedVolumeIds: ['track'] }],
      steps: [
        { id: 's1-cement', kind: 'pump', fluidId: 'cement', rateBpm: 5, quantity: { source: 'placement', placementId: 'cement-1', fraction: 1 } },
        { id: 's1-launch', kind: 'tool-event', deviceId: 'collar', action: 'launch-top' },
        { id: 's1-displace', kind: 'pump', fluidId: 'displacement', rateBpm: 5, quantity: { source: 'displacement', deviceId: 'collar', fraction: 1 } },
      ] }];
    p.paths = [{ id: 'shoe-path', name: 'Circulação pela sapata', legs: [
      { id: 'in', zone: 'internal', assemblyId: 'target', topMD: 0, bottomMD: 1500, direction: 'down' },
      { id: 'out', zone: 'casing-annulus', assemblyId: 'target', topMD: 0, bottomMD: 1500, direction: 'up' },
    ] }];
    s.wellFinalMD = s.wellFinalTVD = 1500;
    return s;
  };

  it('reproduces the reference volumes and pumping time of the base case', () => {
    const scenario = baseCase();
    const before = structuredClone(scenario);
    const result = resolve(scenario);
    expect(result.diagnostics).toEqual([]);
    expect(result.valid).toBe(true);
    const stage = result.stages[0];
    const placement = stage.placements[0];
    expect(placement.annularBbl).toBeCloseTo(1000 * ANNULAR_BBL_M, 9);
    expect(placement.annularBbl).toBeCloseTo(74.100075, 9);
    expect(placement.retainedBbl).toBeCloseTo(20 * INTERNAL_BBL_M, 9);
    expect(placement.retainedBbl).toBeCloseTo(2.510681114592, 9);
    expect(placement.plannedBbl).toBeCloseTo(76.610756114592, 9);
    expect(stage.displacementTargetBbl).toBeCloseTo(185.790402479808, 9);
    expect(stage.displacementProgrammedBbl).toBeCloseTo(185.790402479808, 9);
    expect(stage.totalPumpedBbl).toBeCloseTo(262.401158594400, 9);
    expect(stage.totalTimeMin).toBeCloseTo(52.480231718880, 9);
    expect(scenario).toEqual(before);
  });

  it('places the ideal top exactly at the target TOC and returns nothing', () => {
    const stage = resolve(baseCase()).stages[0];
    expect(stage.idealToc!.tocMD).toBeCloseTo(500, 6);
    expect(stage.idealToc!.returnedBbl).toBe(0);
    expect(stage.idealToc!.reachedSurface).toBe(false);
  });

  it('raises the top by the extra reserve instead of losing its volume', () => {
    const scenario = baseCase();
    // 100 m de anular a mais, pedidos explicitamente como reserva bombeada.
    scenario.primary.stages[0].steps.splice(1, 0, { id: 's1-reserve', kind: 'pump', fluidId: 'cement',
      rateBpm: 5, quantity: { source: 'reserve-extra', placementId: 'cement-1', volumeBbl: 100 * ANNULAR_BBL_M } });
    const stage = resolve(scenario).stages[0];
    expect(stage.placements[0].reserveExtraBbl).toBeCloseTo(7.4100075, 9);
    expect(stage.placements[0].plannedBbl).toBeCloseTo(76.610756114592, 9);
    expect(stage.cementProgrammedBbl).toBeCloseTo(76.610756114592 + 7.4100075, 9);
    expect(stage.idealToc!.tocMD).toBeCloseTo(400, 6);
    expect(stage.idealToc!.returnedBbl).toBe(0);
  });

  it('reports surplus as returned cement with TOC at surface, never negative', () => {
    const scenario = baseCase();
    scenario.primary.stages[0].steps.splice(1, 0, { id: 's1-reserve', kind: 'pump', fluidId: 'cement',
      rateBpm: 5, quantity: { source: 'reserve-extra', placementId: 'cement-1', volumeBbl: 600 * ANNULAR_BBL_M } });
    const stage = resolve(scenario).stages[0];
    expect(stage.idealToc!.tocMD).toBe(0);
    expect(stage.idealToc!.reachedSurface).toBe(true);
    expect(stage.idealToc!.returnedBbl).toBeCloseTo(100 * ANNULAR_BBL_M, 9);
    expect(stage.idealToc!.placedBbl + stage.idealToc!.returnedBbl)
      .toBeCloseTo(stage.cementProgrammedBbl - stage.placements[0].retainedBbl, 9);
  });

  it('keeps the mixing reserve out of the pumped volume and out of the placement', () => {
    const scenario = baseCase();
    scenario.primary.stages[0].placements[0].mixingReserveBbl = 12;
    const stage = resolve(scenario).stages[0];
    expect(stage.placements[0].mixingReserveBbl).toBe(12);
    expect(stage.placements[0].programmedBbl).toBeCloseTo(76.610756114592, 9);
    expect(stage.placements[0].preparedBbl).toBeCloseTo(88.610756114592, 9);
    expect(stage.idealToc!.tocMD).toBeCloseTo(500, 6);
  });

  it('applies annular excess to the sheath only, never to track or displacement', () => {
    const scenario = baseCase();
    scenario.primary.outerBoundaries[0] = { ...scenario.primary.outerBoundaries[0],
      diameter: { source: 'nominal', excessFraction: 0.2 } } as typeof scenario.primary.outerBoundaries[0];
    const stage = resolve(scenario).stages[0];
    expect(stage.placements[0].annularBbl).toBeCloseTo(74.100075 * 1.2, 9);
    expect(stage.placements[0].retainedBbl).toBeCloseTo(2.510681114592, 9);
    expect(stage.displacementTargetBbl).toBeCloseTo(185.790402479808, 9);
  });

  it('splits one placement between steps without duplicating its total', () => {
    const scenario = baseCase();
    const steps = scenario.primary.stages[0].steps;
    steps[0] = { id: 's1-cement-a', kind: 'pump', fluidId: 'cement', rateBpm: 5,
      quantity: { source: 'placement', placementId: 'cement-1', fraction: 0.4 } };
    steps.splice(1, 0, { id: 's1-cement-b', kind: 'pump', fluidId: 'cement', rateBpm: 5,
      quantity: { source: 'placement', placementId: 'cement-1', fraction: 0.6 } });
    const result = resolve(scenario);
    expect(result.diagnostics).toEqual([]);
    expect(result.stages[0].placements[0].fractionSum).toBeCloseTo(1, 12);
    expect(result.stages[0].cementProgrammedBbl).toBeCloseTo(76.610756114592, 9);
    expect(result.stages[0].placements[0].stepIds).toEqual(['s1-cement-a', 's1-cement-b']);
  });

  it('refuses fractions that do not close and a placement left without steps', () => {
    const partial = baseCase();
    (partial.primary.stages[0].steps[0] as { quantity: { fraction: number } }).quantity.fraction = 0.5;
    const partialResult = resolve(partial);
    expect(partialResult.valid).toBe(false);
    expect(partialResult.diagnostics.map(d => d.code)).toContain('PRIMARY_PLACEMENT_FRACTIONS');
    // O volume dimensionado continua visível: o desvio é mostrado, não escondido.
    expect(partialResult.stages[0].placements[0].plannedBbl).toBeCloseTo(76.610756114592, 9);

    const orphan = baseCase();
    orphan.primary.stages[0].steps = orphan.primary.stages[0].steps.filter(s => s.id !== 's1-cement');
    const orphanResult = resolve(orphan);
    expect(orphanResult.valid).toBe(false);
    expect(orphanResult.diagnostics.map(d => d.code)).toContain('PRIMARY_PLACEMENT_NO_STEPS');
  });

  it('requires a rate for a positive volume and refuses entered cement volume', () => {
    const noRate = baseCase();
    (noRate.primary.stages[0].steps[0] as { rateBpm: number }).rateBpm = 0;
    expect(resolve(noRate).diagnostics.map(d => d.code)).toContain('PRIMARY_RATE_REQUIRED');

    const entered = baseCase();
    entered.primary.stages[0].steps[0] = { id: 's1-cement', kind: 'pump', fluidId: 'cement',
      rateBpm: 5, quantity: { source: 'entered', volumeBbl: 50 } };
    expect(resolve(entered).diagnostics.map(d => d.code)).toContain('PRIMARY_CEMENT_QUANTITY');
  });

  it('rejects a gap between the target TOC and the active outlet', () => {
    const scenario = baseCase();
    scenario.primary.stages[0].placements[0].topMD = 700;
    const codes = resolve(scenario).diagnostics.map(d => d.code);
    expect(codes).toContain('PRIMARY_PLACEMENT_GAP');
  });

  it('counts the shoe track once and refuses to repeat it in a later stage', () => {
    const scenario = primaryContractExample('two-stage');
    scenario.primary.stages[1].placements[0].retainedVolumeIds = ['track'];
    const result = resolve(scenario);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.map(d => d.code)).toContain('PRIMARY_TRACK_STAGE');
    expect(result.stages[1].placements[0].retainedBbl).toBe(0);
    expect(result.stages[0].placements[0].retainedBbl).toBeGreaterThan(0);
  });

  it('keeps two stages independent and flags an interval already dimensioned', () => {
    const clean = resolve(primaryContractExample('two-stage'));
    expect(clean.diagnostics).toEqual([]);
    expect(clean.stages).toHaveLength(2);
    expect(clean.stages[1].placements[0].retainedBbl).toBe(0);
    expect(clean.totalCementProgrammedBbl)
      .toBeCloseTo(clean.stages[0].cementProgrammedBbl + clean.stages[1].cementProgrammedBbl, 9);

    // O primeiro estágio desce o TOC para 900 e invade o trecho já dimensionado no segundo.
    const conflict = primaryContractExample('two-stage');
    conflict.primary.stages[0].targetTocMD = 900;
    conflict.primary.stages[0].placements[0].topMD = 900;
    const conflictResult = resolve(conflict);
    expect(conflictResult.valid).toBe(false);
    expect(conflictResult.diagnostics.map(d => d.code)).toContain('PRIMARY_PLACEMENT_STAGE_CONFLICT');
  });

  it('uses the liner launch route for displacement instead of the casing alone', () => {
    const result = resolve(primaryContractExample('liner'));
    expect(result.diagnostics).toEqual([]);
    expect(result.stages[0].displacementTargetBbl).toBeCloseTo(162.287132, 9);
    expect(result.stages[0].displacementProgrammedBbl).toBeCloseTo(162.287132, 9);
  });

  it('does not dimension a program over an invalid geometry', () => {
    const scenario = baseCase();
    scenario.primary.target = null;
    const result = resolve(scenario);
    expect(result.valid).toBe(false);
    expect(result.stages).toEqual([]);
    expect(result.diagnostics.map(d => d.code)).toContain('PRIMARY_VOLUMES_GEOMETRY');
  });
});
