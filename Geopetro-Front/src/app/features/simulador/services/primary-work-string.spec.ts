import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BBL_M } from '../models/constantes';
import type { PrimaryConfiguration, PrimaryFluid, PrimaryPumpStep, PrimaryReference } from '../models/primary-cementing.model';
import type { WellGeometry } from '../models/well-geometry.model';
import { K } from './primary-hydraulics';
import { PrimaryProgramService } from './primary-program.service';
import { RetiradaTubosReportService } from './retirada-tubos-report.service';
import { retiradaTubos } from './retirada-tubos';
import { TampaoCalculoService } from './tampao-calculo.service';
import { buildWorkStringConfiguration, workStringOuterWall, WORK_STRING_ASSEMBLY_ID } from './work-string-config';
import { resolveWorkStringPull } from './work-string-pull';

/**
 * Tampão balanceado no motor da primária (SPEC squeeze-tampao §6, casos T-01 a T-06).
 * Poço vertical: 9⅝" 47 lb/pé (ID 8,681") até 1000 m e 8½" aberto até 2600 m.
 * Coluna 4½" 16,6 lb/pé (ID 3,826") de extremidade aberta a 2510 m, a geometria do
 * exemplo de tampão do Petroguia (F-20), sem o excesso de 50% do livro.
 */
const well: WellGeometry = { finalMD: 2600, finalTVD: 2600, phases: [
  { id: 'surface', name: 'Superfície 12¼"', type: 'SURFACE', topMD: 0, bottomMD: 1000, topTVD: 0, bottomTVD: 1000,
    holeDiameterIn: 12.25, casing: { odIn: 9.625, idIn: 8.681, bottomMD: 1000 } },
  { id: 'open', name: 'Poço aberto 8½"', type: 'PRODUCTION', topMD: 1000, bottomMD: 2600, topTVD: 1000, bottomTVD: 2600,
    holeDiameterIn: 8.5 },
] };
const OPEN_END = 2510;
const PLUG_TOP = 2370;
const CP = 2.0885e-5; // lbf·s/ft² por cP
const fluid = (id: string, kind: PrimaryFluid['kind'], densityPpg: number, n: number, kLbfSnFt2: number): PrimaryFluid => ({
  id, kind, name: id, densityPpg, rheology: { model: 'power-law', n, kLbfSnFt2 },
  propertySources: { n: { source: 'entered' }, kLbfSnFt2: { source: 'entered' }, densityPpg: { source: 'entered' } } });
const FLUIDS = [
  fluid('mud', 'mud', 9.0, 0.6, 0.012),
  fluid('water', 'wash', 8.33, 1, CP),
  fluid('cement', 'cement', 15.8, 0.45, 0.05),
  fluid('displacement', 'displacement', 9.0, 0.6, 0.012),
];

// Capacidades pelas mesmas constantes do motor (bbl/m).
const Ctp = BBL_M * 3.826 ** 2;
const Can = BBL_M * (8.5 ** 2 - 4.5 ** 2);
const hole = BBL_M * 8.5 ** 2;
/** Petroguia F-19 com mesmo fluido à frente e atrás. */
const design = (() => {
  const Vp = (OPEN_END - PLUG_TOP) * hole;
  const Htci = Vp / (Can + Ctp);
  const Vfa = 5;
  const Hfa = Vfa / Ctp;
  const Vff = Hfa * Can;
  const Vd = (OPEN_END - Htci - Hfa) * Ctp;
  return { Vp, Htci, Vfa, Hfa, Vff, Vd };
})();

const pump = (id: string, fluidId: string, volumeBbl: number, rateBpm: number): PrimaryPumpStep =>
  ({ id, kind: 'pump', fluidId, rateBpm, quantity: { source: 'entered', volumeBbl } });
const plugProgram = (displacementBbl: number): PrimaryPumpStep[] => [
  pump('front', 'water', design.Vff, 3), pump('slurry', 'cement', design.Vp, 3),
  pump('back', 'water', design.Vfa, 3), pump('displace', 'displacement', displacementBbl, 3),
  { id: 'settle', kind: 'pause', durationMin: 240, untilBalanced: true },
];

function configuration(steps: PrimaryPumpStep[], over: Partial<PrimaryConfiguration> = {}): PrimaryConfiguration {
  return { ...buildWorkStringConfiguration(well, { openEndMD: OPEN_END,
    sections: [{ topMD: 0, bottomMD: OPEN_END, idIn: 3.826, odIn: 4.5 }],
    fluids: FLUIDS, initialFluidId: 'mud', steps, headCondition: 'vented-free-surface', returnPressurePsi: 0,
    friction: { internal: 'low', annular: 'low' }, pressureWindow: [],
    equipmentLimits: { maxPressurePsi: null, maxRateBpm: null, motorHp: null, efficiency: null } }), ...over };
}
function run(steps: PrimaryPumpStep[], references: PrimaryReference[] = [], over: Partial<PrimaryConfiguration> = {}) {
  const primary = configuration(steps, over);
  return { primary, resolution: TestBed.inject(PrimaryProgramService).resolve(well, primary, references) };
}

describe('coluna de trabalho no motor da primária (tampão balanceado)', () => {
  it('monta a parede externa pelo cadastro: revestimento até a sapata, poço aberto da fase abaixo', () => {
    const wall = workStringOuterWall(well, OPEN_END);
    expect(wall.outerBoundaries.map(b => [b.kind, b.topMD, b.bottomMD])).toEqual([
      ['previous-casing', 0, 1000], ['open-hole', 1000, OPEN_END]]);
    const open = wall.outerBoundaries[1];
    expect(open.kind === 'open-hole' && open.diameter).toEqual({ source: 'nominal', excessFraction: 0 });
    const { resolution } = run(plugProgram(design.Vd));
    expect(resolution.geometry.issues.filter(i => i.level === 'error')).toEqual([]);
    const segments = resolution.geometry.fullGeometry.segments;
    expect(segments.every(s => s.equipmentId === WORK_STRING_ASSEMBLY_ID)).toBe(true);
    expect(segments.at(-1)!.bottomMD).toBe(OPEN_END);
    expect(resolution.geometry.stages[0].displacementBbl).toBeCloseTo(OPEN_END * Ctp, 9);
  });

  it('T-01: fluidos de mesma densidade, sem tubo em U: bombeio vence só o atrito e, parado, ECD = ESD', () => {
    const same = [fluid('mud', 'mud', 9, 0.6, 0.012), fluid('water9', 'wash', 9, 1, CP),
      fluid('displacement', 'displacement', 9, 0.6, 0.012)];
    const { resolution } = run([pump('a', 'water9', 20, 3), { id: 'p', kind: 'pause', durationMin: 5 },
      pump('b', 'displacement', 10, 3)], [], { fluids: same });
    const hydraulics = resolution.hydraulics!;
    expect(resolution.transport!.status).toBe('complete');
    expect(resolution.transport!.diagnostics.some(d => d.code === 'PRIMARY_FREE_FALL')).toBe(false);
    const pumping = hydraulics.points.filter(p => p.pumpRateBpm > 0 && p.state === 'full');
    const paused = hydraulics.points.filter(p => p.phase === 'static');
    expect(pumping.length).toBeGreaterThan(5);
    expect(paused.length).toBeGreaterThan(0);
    for (const p of pumping) {
      expect(p.annularHydrostaticPsi!).toBeCloseTo(p.internalHydrostaticPsi!, 6);
      expect(p.pumpPressurePsi!).toBeCloseTo(p.pipeFrictionPsi! + p.annularFrictionPsi!, 6);
      expect(p.annularFrictionPsi!).toBeGreaterThan(0);
      expect(p.ecdPpg! - p.annularHydrostaticPsi! / (K * OPEN_END)).toBeCloseTo(p.annularFrictionPsi! / (K * OPEN_END), 9);
    }
    for (const p of paused) expect(p.ecdPpg!).toBeCloseTo(p.annularHydrostaticPsi! / (K * OPEN_END), 9);
  });

  it('T-02: pasta pesada na coluna aberta cai livre, com vazio, e o balanço por fluido fecha em todo instante', () => {
    const { resolution } = run(plugProgram(design.Vd));
    const transport = resolution.transport!;
    const points = resolution.hydraulics!.points;
    expect(transport.diagnostics.some(d => d.code === 'PRIMARY_FREE_FALL')).toBe(true);
    expect(points.some(p => p.state === 'free-fall' && p.outletRateBpm! > p.pumpRateBpm + 0.5)).toBe(true);
    expect(Math.max(...points.map(p => p.voidVolumeBbl ?? 0))).toBeGreaterThan(1);
    for (const snapshot of transport.snapshots)
      for (const entry of snapshot.inventory) expect(Math.abs(entry.balanceErrorBbl)).toBeLessThan(1e-8);
  });

  it('T-03: o exemplo do Petroguia sem excesso termina com as interfaces nas alturas de projeto', () => {
    // Números do livro (F-20), refeitos sem os 50%: Htci 151,7 m; Vff 17,8 bbl; Vd 105,1 bbl.
    expect(design.Vp).toBeCloseTo(32.2, 1);
    expect(Math.abs(design.Htci - 151.7)).toBeLessThan(0.2);
    expect(Math.abs(design.Vff - 17.8)).toBeLessThan(0.1);
    expect(Math.abs(design.Vd - 105.1)).toBeLessThan(0.2);
    const { resolution } = run(plugProgram(design.Vd));
    const parcels = resolution.transport!.snapshots.at(-1)!.parcels;
    const top = (zone: string, fluidId: string) =>
      Math.min(...parcels.filter(p => p.zone === zone && p.fluidId === fluidId).map(p => p.topMD));
    for (const zone of ['internal', 'casing-annulus']) {
      expect(Math.abs(top(zone, 'cement') - (OPEN_END - design.Htci))).toBeLessThan(0.1);
      expect(Math.abs(top(zone, 'water') - (OPEN_END - design.Htci - design.Hfa))).toBeLessThan(0.1);
    }
  });

  it('T-04: hidrostática e ECD numa referência acima da extremidade batem com a coluna de fluidos à mão', () => {
    const { resolution } = run(plugProgram(design.Vd), [
      { id: 'ref-2400', name: '2400 m', md: 2400, zone: 'casing-annulus', assemblyId: WORK_STRING_ASSEMBLY_ID }]);
    const reference = resolution.hydraulics!.points.at(-1)!.references.find(r => r.id === 'ref-2400')!;
    const waterTop = OPEN_END - design.Htci - design.Hfa;
    const cementTop = OPEN_END - design.Htci;
    const hand = K * (9 * waterTop + 8.33 * (cementTop - waterTop) + 15.8 * (2400 - cementTop));
    expect(Math.abs(reference.hydrostaticPsi! - hand)).toBeLessThan(0.5);
    // Parado e com retorno atmosférico, a pressão é só a hidrostática.
    expect(reference.pressurePsi!).toBeCloseTo(reference.hydrostaticPsi!, 9);
    expect(reference.ecdPpg!).toBeCloseTo(reference.hydrostaticPsi! / (K * 2400), 9);
  });

  it('T-05: deslocado até o equilíbrio, as colunas empatam na extremidade e nada drena', () => {
    const { resolution } = run(plugProgram(design.Vd));
    const settle = resolution.transport!.diagnostics.find(d => d.code === 'PRIMARY_SETTLE')!;
    expect(settle.value!).toBeLessThan(1e-6);
    expect(resolution.transport!.events.some(e => e.kind === 'balance-reached')).toBe(true);
    const last = resolution.hydraulics!.points.at(-1)!;
    expect(Math.abs(last.internalHydrostaticPsi! - last.annularHydrostaticPsi!)).toBeLessThan(0.5);
    expect(last.voidVolumeBbl!).toBeLessThan(1e-6);
    expect(resolution.hydraulics!.diagnostics.some(d => d.code === 'PRIMARY_WORKSTRING_BACKFLOW')).toBe(false);
  });

  it('T-06: subdeslocado em 2,5 bbl, a coluna drena depois do bombeio até equilibrar', () => {
    const { resolution } = run(plugProgram(design.Vd - 2.5));
    const transport = resolution.transport!;
    const settle = transport.diagnostics.find(d => d.code === 'PRIMARY_SETTLE')!;
    expect(settle.value!).toBeGreaterThan(0.1);
    expect(settle.limit!).toBeGreaterThan(0);
    expect(transport.diagnostics.some(d => d.code === 'PRIMARY_SETTLE_TIMEOUT')).toBe(false);
    const points = resolution.hydraulics!.points;
    const start = points.find(p => p.stepId === 'settle')!;
    const last = points.at(-1)!;
    const imbalance = (p: typeof last) => p.internalHydrostaticPsi! - p.annularHydrostaticPsi!;
    // Cabeça aberta: o vazio fica a 0 psi. Com lei de potência a drenagem desacelera
    // sem parar; o motor encerra abaixo de 0,001 bpm, com um resíduo pequeno.
    expect(imbalance(start)).toBeGreaterThan(20);
    expect(last.voidVolumeBbl!).toBeGreaterThan(0.1);
    expect(last.outletRateBpm!).toBeLessThanOrEqual(1e-3);
    expect(Math.abs(imbalance(last))).toBeLessThan(5);
    expect(Math.abs(imbalance(last))).toBeLessThan(0.1 * imbalance(start));
    for (const snapshot of transport.snapshots)
      for (const entry of snapshot.inventory) expect(Math.abs(entry.balanceErrorBbl)).toBeLessThan(1e-8);
  });

  it('sobredeslocado, avisa que o anular devolveria fluido pela coluna, sem simular o retorno', () => {
    const { resolution } = run(plugProgram(design.Vd + 2.5));
    const backflow = resolution.hydraulics!.diagnostics.find(d => d.code === 'PRIMARY_WORKSTRING_BACKFLOW')!;
    expect(backflow).toBeTruthy();
    expect(backflow.severity).toBe('warning');
    expect(backflow.value!).toBeGreaterThan(10);
  });

  it('recusa colar, shoe track e intervalo de pasta na coluna de trabalho', () => {
    const bad = configuration(plugProgram(design.Vd));
    const withTrack = { ...bad, target: { ...bad.target!, floatCollarMD: OPEN_END - 10 } };
    const service = TestBed.inject(PrimaryProgramService);
    expect(service.resolve(well, withTrack).geometry.issues.some(i => i.code === 'PRIMARY_TARGET_DEPTH')).toBe(true);
    const withPlacement = { ...bad, stages: [{ ...bad.stages[0],
      placements: [{ id: 'x', fluidId: 'cement', topMD: 2370, bottomMD: OPEN_END, retainedVolumeIds: [] }] }] };
    expect(service.resolve(well, withPlacement).volumes.diagnostics.some(d => d.code === 'PRIMARY_WORKSTRING_PLACEMENT')).toBe(true);
  });
});

describe('retirada da coluna de trabalho (S3)', () => {
  /** O dimensionamento de hoje do tampão, para o mesmo poço e a mesma coluna. */
  const legacyPlug = () => TestBed.inject(TampaoCalculoService).calcPlug({
    sectionStartMD: PLUG_TOP, sectionEndMD: OPEN_END, sectionStartTVD: PLUG_TOP, sectionEndTVD: OPEN_END,
    wellFinalMD: 2600, wellFinalTVD: 2600, holeID: 8.5, pipeOD: 4.5, pipeID: 3.826,
    backSpacerHeight: design.Hfa, mudWeightFront: 8.33, mudWeightBack: 8.33, completionWeight: 9,
    fracGrad: 16, poreGrad: 9, pumpRate: 3, surfaceTemp: 80, geoGradient: 1.5,
  }, null, { geometry: well, interval: { topMD: PLUG_TOP, bottomMD: OPEN_END } });

  function pulled() {
    const { resolution, primary } = run(plugProgram(design.Vd));
    const plug = legacyPlug();
    const retirada = retiradaTubos({ baseDepthMD: OPEN_END, cementTopMD: plug.topCementWithoutTubing });
    const pull = resolveWorkStringPull(resolution.geometry.fullGeometry.segments, resolution.transport!.snapshots.at(-1)!,
      primary.fluids, primary.initialFluidId!, retirada.openEndDepthM, md => md);
    return { plug, retirada, pull };
  }

  it('o programa do motor usa os mesmos volumes que o dimensionamento do tampão calcula', () => {
    const plug = legacyPlug();
    expect(plug.volCementTotal).toBeCloseTo(design.Vp, 6);
    expect(plug.frontPhysicalVolumeBbl).toBeCloseTo(design.Vff, 6);
    expect(plug.backPhysicalVolumeBbl).toBeCloseTo(design.Vfa, 6);
    expect(plug.volDisplacement).toBeCloseTo(design.Vd, 6);
  });

  it('T-07: a extremidade depois da retirada é a do relatório de retirada, pela mesma regra', () => {
    const { plug, retirada, pull } = pulled();
    const report = TestBed.inject(RetiradaTubosReportService).buildCalculation(
      { sectionEndMD: OPEN_END, sectionStartMD: PLUG_TOP }, plug.topCementWithoutTubing);
    expect(report).toEqual(retirada);
    // Campos vazios da sequência usam o padrão, em vez de virar tubo de 0 m.
    const blank = { comprimentoTuboM: '', secoesAcimaTopoCimento: '', tubosPorSecao: '' } as unknown as
      Parameters<RetiradaTubosReportService['buildCalculation']>[2];
    expect(TestBed.inject(RetiradaTubosReportService).buildCalculation(
      { sectionEndMD: OPEN_END, sectionStartMD: PLUG_TOP }, plug.topCementWithoutTubing, blank)).toEqual(retirada);
    // 15 tubos do tampão + 2 seções de 2 tubos, de 9,4 m.
    expect(retirada.totalTubesCount).toBe(19);
    expect(retirada.openEndDepthM).toBeCloseTo(OPEN_END - 19 * 9.4, 9);
    expect(pull.toMD).toBe(retirada.openEndDepthM);
  });

  it('T-08: o topo do cimento depois da retirada é o do dimensionamento', () => {
    const { plug, pull } = pulled();
    expect(Math.abs(pull.wellboreTopOf('cement')! - plug.topCementWithoutTubing)).toBeLessThan(0.1);
    expect(plug.topCementWithoutTubing).toBeCloseTo(PLUG_TOP, 6);
  });

  it('conserva cada fluido e completa na superfície exatamente o aço retirado', () => {
    const { resolution } = run(plugProgram(design.Vd));
    const { pull } = pulled();
    const before = new Map<string, number>();
    for (const parcel of resolution.transport!.snapshots.at(-1)!.parcels)
      before.set(parcel.fluidId, (before.get(parcel.fluidId) ?? 0) + parcel.volumeBbl);
    const after = new Map<string, number>();
    for (const layer of [...pull.internal, ...pull.annulus, ...pull.wellbore])
      after.set(layer.fluidId, (after.get(layer.fluidId) ?? 0) + layer.volumeBbl);
    for (const fluidId of ['cement', 'water', 'displacement']) expect(after.get(fluidId)!).toBeCloseTo(before.get(fluidId)!, 6);
    expect(after.get('mud')! - before.get('mud')!).toBeCloseTo(pull.fillUpBbl, 6);
    expect(pull.fillUpBbl).toBeCloseTo(pull.steelBbl, 6);
    expect(pull.steelBbl).toBeCloseTo(BBL_M * (4.5 ** 2 - 3.826 ** 2) * (OPEN_END - pull.toMD), 9);
  });

  it('dá a hidrostática na base do tampão depois da retirada, conferida à mão', () => {
    const { pull } = pulled();
    // À mão: abaixo da extremidade tudo em poço cheio; o vão do aço desce a mesma
    // altura por dentro e por fora; o topo da água acima da extremidade desce junto.
    const belowBbl = (Can + Ctp) * (OPEN_END - pull.toMD);
    const stackTop = OPEN_END - belowBbl / hole;
    const drop = hole * (stackTop - pull.toMD) / (Can + Ctp);
    const waterTop = OPEN_END - design.Htci - design.Hfa + drop;
    expect(pull.dropM).toBeCloseTo(drop, 6);
    const hand = K * (9 * waterTop + 8.33 * (PLUG_TOP - waterTop) + 15.8 * (OPEN_END - PLUG_TOP));
    expect(Math.abs(pull.hydrostaticPsiAt(OPEN_END) - hand)).toBeLessThan(0.5);
    // A pasta abaixa de 151,8 m (com coluna) para 140 m (poço cheio): a base fica mais leve.
    const beforePull = K * (9 * (OPEN_END - design.Htci - design.Hfa) + 8.33 * design.Hfa + 15.8 * design.Htci);
    expect(pull.hydrostaticPsiAt(OPEN_END)).toBeLessThan(beforePull);
  });

  it('sem retirada (extremidade igual ou abaixo), devolve o estado do fim do bombeio', () => {
    const { resolution, primary } = run(plugProgram(design.Vd));
    const same = resolveWorkStringPull(resolution.geometry.fullGeometry.segments, resolution.transport!.snapshots.at(-1)!,
      primary.fluids, 'mud', OPEN_END, md => md);
    expect(same.wellbore).toEqual([]);
    expect(same.steelBbl).toBe(0);
  });
});
