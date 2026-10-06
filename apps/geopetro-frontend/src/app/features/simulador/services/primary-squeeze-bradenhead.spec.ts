import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BBL_M } from '../models/constantes';
import type { WellGeometry } from '../models/well-geometry.model';
import { primaryPipeFriction } from './primary-friction';
import { K, PRIMARY_FRICTION_LEVEL_MULTIPLIER } from './primary-hydraulics';
import { PrimaryProgramService } from './primary-program.service';
import { TampaoCalculoService } from './tampao-calculo.service';
import { runTampaoEngine, type TampaoEngineInput } from './tampao-engine';
import { injectedVolumeSeries, resolveSqueezeCompression, type SqueezeCompressionInput,
  type CompressionBlock } from './work-string-compression';
import { fannPowerLaw, wellWallSections } from './work-string-config';

/**
 * Squeeze Bradenhead no motor da primária (SPEC squeeze-tampao S5, casos T-10 a T-14).
 * Poço vertical revestido: 9⅝" até 500 m e 7" 26 lb/pé (ID 6,276") até 2000 m.
 * Canhoneados de 1850 a 1860 m. Tampão de pasta de 1780 a 1880 m posicionado por uma
 * coluna 2⅞" 6,5 lb/pé (ID 2,441") com extremidade aberta a 1880 m; a coluna sobe
 * pela regra do relatório de retirada, o poço é fechado e a pasta é comprimida.
 */
const well: WellGeometry = { finalMD: 2000, finalTVD: 2000, phases: [
  { id: 'surface', name: 'Superfície 12¼"', type: 'SURFACE', topMD: 0, bottomMD: 500, topTVD: 0, bottomTVD: 500,
    holeDiameterIn: 12.25, casing: { odIn: 9.625, idIn: 8.681, bottomMD: 500 } },
  { id: 'production', name: 'Produção 8½"', type: 'PRODUCTION', topMD: 500, bottomMD: 2000, topTVD: 500, bottomTVD: 2000,
    holeDiameterIn: 8.5, casing: { odIn: 7, idIn: 6.276, bottomMD: 2000 } },
] };
const PLUG_TOP = 1780;
const PLUG_BASE = 1880;
const PERFS = { topMD: 1850, baseMD: 1860 };
const tvdOf = (md: number) => md;
const casingCap = BBL_M * 6.276 ** 2;

function plug() {
  return TestBed.inject(TampaoCalculoService).calcPlug({
    sectionStartMD: PLUG_TOP, sectionEndMD: PLUG_BASE, sectionStartTVD: PLUG_TOP, sectionEndTVD: PLUG_BASE,
    wellFinalMD: 2000, wellFinalTVD: 2000, holeID: 6.276, pipeOD: 2.875, pipeID: 2.441,
    backSpacerHeight: 60, mudWeightFront: 8.33, mudWeightBack: 8.33, completionWeight: 9,
    fracGrad: 15, poreGrad: 8.5, pumpRate: 2, surfaceTemp: 80, geoGradient: 1.5,
  }, null, { geometry: well, interval: { topMD: PLUG_TOP, bottomMD: PLUG_BASE } });
}

function positioning() {
  const input: TampaoEngineInput = {
    geometry: well, plug: plug(), pipeODIn: 2.875, pipeIDIn: 2.441,
    densities: { completion: 9, front: 8.33, back: 8.33, displacement: 9, slurry: 15.8 },
    waterViscosityCp: 1, slurryRheology: { ...fannPowerLaw(181, 132, 79), origin: 'theta' },
    rates: { front: 2, slurry: 2, back: 2, displacement: 2 }, pausesMin: [0, 0, 0],
    friction: { internal: 'medium', annular: 'medium' }, headCondition: 'closed-head', poreGradPpg: 8.5, fracGradPpg: 15,
    equipment: { maxSurfacePressurePsi: null, maxPumpRateBpm: null, motorHp: null, pumpEffPct: null },
  };
  return runTampaoEngine(TestBed.inject(PrimaryProgramService), input, tvdOf);
}

function compress(blocks: CompressionBlock[], over: Partial<SqueezeCompressionInput> = {}) {
  const tampao = positioning();
  const input: SqueezeCompressionInput = {
    segments: tampao.resolution.geometry.fullGeometry.segments, wall: wellWallSections(well, PLUG_BASE),
    start: tampao.pull!, isolation: { kind: 'bradenhead' }, fluids: tampao.primary.fluids,
    defaultFluidId: 'displacement', perforations: PERFS, blocks, friction: { internal: 'medium', annular: 'medium' },
    fracGradPpg: 15, poreGradPpg: 8.5, tvdOf, startTimeMin: tampao.summary.totalTimeMin,
    startPumpedBbl: tampao.resolution.transport!.totalPumpedBbl, ...over,
  };
  return { tampao, input, result: resolveSqueezeCompression(input) };
}
const perfRef = (p: { references: { id: string; pressurePsi: number; hydrostaticPsi: number; ecdPpg: number | null; tvd: number }[] }) =>
  p.references.find(r => r.id === 'perforations')!;

/** Hidrostática e atrito pelo percurso coluna → extremidade → revestimento até o canhoneado, à mão. */
function byHand(result: ReturnType<typeof compress>, md: number, rateBpm: number) {
  const { tampao, input } = result;
  const pull = tampao.pull!;
  const fluid = new Map(tampao.primary.fluids.map(f => [f.id, f]));
  // Estado no início da compressão: coluna do pull e revestimento abaixo da extremidade.
  const layers = [...pull.internal.map(l => ({ ...l, zone: 'string' as const, d: 2.441 })),
    ...pull.wellbore.map(l => ({ ...l, zone: 'casing' as const, d: 6.276 }))];
  let hydro = 0; let friction = 0;
  for (const layer of layers) {
    const bottom = Math.min(layer.bottomMD, md);
    if (bottom <= layer.topMD) continue;
    const f = fluid.get(layer.fluidId)!;
    hydro += K * f.densityPpg * (bottom - layer.topMD);
    // A saída é o canhoneado de base: abaixo dele não há vazão.
    const flowing = Math.min(bottom, input.perforations.baseMD) - layer.topMD;
    if (flowing > 0 && rateBpm > 0)
      friction += primaryPipeFriction({ flowRateBpm: rateBpm, densityPpg: f.densityPpg, n: f.rheology.n,
        kLbfSnFt2: f.rheology.kLbfSnFt2, lengthM: flowing }, layer.d).pressureDropPsi! * PRIMARY_FRICTION_LEVEL_MULTIPLIER.medium;
  }
  return { hydro, friction };
}

describe('squeeze Bradenhead: posicionamento, retirada e compressão (S5)', () => {
  it('T-10: comprime com a coluna acima do topo do cimento, anular parado e o volume programado na formação', () => {
    const run = compress([{ kind: 'inject', volumeBbl: 2, rateBpm: 0.5, surfacePressurePsi: 1000 },
      { kind: 'pressurize', durationMin: 15, surfacePressurePsi: 1500 }]);
    const { tampao, result } = run;
    const pull = tampao.pull!;
    // Coluna acima do topo do cimento: 11 tubos do tampão + 2 seções de 2, de 9,4 m.
    expect(pull.toMD).toBeCloseTo(PLUG_BASE - 15 * 9.4, 9);
    expect(pull.wellboreTopOf('slurry')!).toBeGreaterThan(pull.toMD);
    expect(result.diagnostics.map(d => d.code)).not.toContain('PRIMARY_SQUEEZE_STRING_IN_CEMENT');
    // Retorno fechado: nada sai pelo anular, que não se move.
    expect(result.annulus).toEqual(pull.annulus);
    expect(result.points.at(-1)!.injectedVolumeBbl).toBeCloseTo(2, 9);
    expect(result.injectedByFluid).toEqual({ slurry: expect.closeTo(2, 9) });
    // A pasta que sobra acima do canhoneado desce 2 bbl no revestimento de 7".
    const top = Math.min(...result.wellbore.filter(l => l.fluidId === 'slurry').map(l => l.topMD));
    expect(top).toBeCloseTo(pull.wellboreTopOf('slurry')! + 2 / casingCap, 6);
    // Conservação por fluido: antes + bombeado = depois + injetado.
    const sum = (layers: { fluidId: string; volumeBbl: number }[], id: string) =>
      layers.filter(l => l.fluidId === id).reduce((s, l) => s + l.volumeBbl, 0);
    for (const id of ['completion', 'front', 'slurry', 'back', 'displacement']) {
      const before = sum([...pull.internal, ...pull.annulus, ...pull.wellbore], id);
      const after = sum([...result.internal, ...result.annulus, ...result.wellbore], id);
      expect(Math.abs(before + (result.pumpedByFluid[id] ?? 0) - after - (result.injectedByFluid[id] ?? 0))).toBeLessThan(1e-8);
    }
    // Série extra do gráfico de volume.
    const series = injectedVolumeSeries(result, tampao.summary.totalTimeMin);
    expect(series.kind).toBe('extra');
    expect(series.label).toBe('Injetado na formação');
    expect(series.points.at(-1)!.volumeBbl).toBeCloseTo(2, 9);
  });

  it('T-11: na injeção, a pressão no canhoneado é a de superfície mais a hidrostática menos o atrito do percurso', () => {
    const run = compress([{ kind: 'inject', volumeBbl: 2, rateBpm: 0.5, surfacePressurePsi: 1000 }]);
    const first = run.result.points[0];
    // A referência é o meio dos canhoneados, dentro do trecho em fluxo até o canhoneado de base.
    const hand = byHand(run, 1855, 0.5);
    const atTop = first.references.find(r => r.id === 'perforations')!;
    expect(atTop.pressurePsi).toBeCloseTo(1000 + hand.hydro - hand.friction, 6);
    expect(first.stringFrictionPsi + first.casingFrictionPsi).toBeCloseTo(byHand(run, PERFS.baseMD, 0.5).friction, 6);
    expect(hand.friction).toBeGreaterThan(0);
    // A ECD da referência sobe com a pressão de superfície: 1000 psi a mais em 1855 m.
    const without = compress([{ kind: 'inject', volumeBbl: 2, rateBpm: 0.5, surfacePressurePsi: 0 }]).result.points[0];
    expect(atTop.ecdPpg! - perfRef(without).ecdPpg!).toBeCloseTo(1000 / (K * 1855), 9);
    // Bradenhead: a cabeça do revestimento fica sob pressão, a de superfície menos o atrito da coluna.
    expect(first.casingHeadPressurePsi).toBeCloseTo(1000 - first.stringFrictionPsi, 6);
  });

  it('T-12: na pressurização, sem atrito, a ECD é (P + hidrostática) / (K · TVD) e fica constante', () => {
    const run = compress([{ kind: 'pressurize', durationMin: 15, surfacePressurePsi: 1500 }]);
    const [start, end] = run.result.points;
    expect(end.timeMin - start.timeMin).toBeCloseTo(15, 9);
    const hand = byHand(run, 1855, 0);
    for (const p of [start, end]) {
      expect(p.stringFrictionPsi + p.casingFrictionPsi).toBe(0);
      expect(perfRef(p).ecdPpg!).toBeCloseTo((1500 + hand.hydro) / (K * 1855), 9);
      expect(p.injectedVolumeBbl).toBe(0);
    }
    // Completação e deslocamento de mesma densidade: a hidrostática pelo anular é a mesma.
    expect(perfRef(start).hydrostaticPsi).toBeCloseTo(hand.hydro, 6);
  });

  it('T-13: a hesitação soma tempo e volume bloco a bloco, com a injeção em degraus', () => {
    const cycle: CompressionBlock[] = [{ kind: 'inject', volumeBbl: 1, rateBpm: 0.25, surfacePressurePsi: 800 },
      { kind: 'pressurize', durationMin: 10, surfacePressurePsi: 1200 }];
    const run = compress([...cycle, ...cycle, ...cycle]);
    const { result, tampao } = run;
    expect(result.blocks).toHaveLength(6);
    expect(result.blocks.map(b => b.injectedBbl)).toEqual([1, 0, 1, 0, 1, 0].map(v => expect.closeTo(v, 9)));
    expect(result.blocks.map(b => b.endMin - b.startMin)).toEqual([4, 10, 4, 10, 4, 10].map(v => expect.closeTo(v, 9)));
    expect(result.totalTimeMin - tampao.summary.totalTimeMin).toBeCloseTo(42, 9);
    for (let i = 1; i < result.blocks.length; i++) expect(result.blocks[i].startMin).toBeCloseTo(result.blocks[i - 1].endMin, 9);
    // Degraus: o injetado não muda na pressurização e a ECD fica constante nela.
    for (const block of result.blocks.filter(b => b.kind === 'pressurize')) {
      const points = result.points.filter(p => p.blockIndex === block.index);
      expect(new Set(points.map(p => p.injectedVolumeBbl.toFixed(9))).size).toBe(1);
      expect(new Set(points.map(p => perfRef(p).ecdPpg!.toFixed(9))).size).toBe(1);
    }
    expect(result.points.at(-1)!.injectedVolumeBbl).toBeCloseTo(3, 9);
  });

  it('T-14: pressão acima do limite de baixa pressão avisa squeeze de alta pressão, com o limite, sem bloquear', () => {
    const run = compress([{ kind: 'pressurize', durationMin: 10, surfacePressurePsi: 1500 },
      { kind: 'pressurize', durationMin: 10, surfacePressurePsi: 3000 }]);
    const { result } = run;
    // Limite à mão: a fratura no ponto mais crítico do canhoneado menos a coluna até ele.
    const limit = Math.min(...[PERFS.topMD, PERFS.baseMD].map(md => K * 15 * md - byHand(run, md, 0).hydro));
    expect(result.blocks[0].maxLowPressureSurfacePsi).toBeCloseTo(limit, 6);
    expect(result.blocks[0].highPressure).toBe(false);
    expect(result.blocks[1].highPressure).toBe(true);
    const alert = result.diagnostics.find(d => d.code === 'PRIMARY_SQUEEZE_HIGH_PRESSURE')!;
    expect(alert.severity).toBe('warning');
    expect(alert.value).toBe(3000);
    expect(alert.limit!).toBeCloseTo(limit, 6);
    expect(result.points.filter(p => p.blockIndex === 1)).toHaveLength(2);
  });

  it('avisa quando o topo da pasta passa do canhoneado de topo e quando o fluido de trás entra na formação', () => {
    const run = compress([{ kind: 'inject', volumeBbl: 12, rateBpm: 0.5, surfacePressurePsi: 500 }]);
    const top = run.tampao.pull!.wellboreTopOf('slurry')!;
    // Sai pelo canhoneado de base: a pasta acima dele entra toda antes do fluido de trás.
    const cementAboveBase = (PERFS.baseMD - top) * casingCap;
    expect(run.result.injectedByFluid['slurry']).toBeCloseTo(cementAboveBase, 6);
    const overdisplaced = run.result.diagnostics.find(d => d.code === 'PRIMARY_SQUEEZE_OVERDISPLACED')!;
    expect(overdisplaced.value!).toBeCloseTo(12 - cementAboveBase, 6);
    // Antes disso, o topo da pasta passa do canhoneado de topo (amostras de 0,05 bbl).
    const uncovered = run.result.diagnostics.find(d => d.code === 'PRIMARY_SQUEEZE_PERFS_UNCOVERED')!;
    expect(Math.abs(uncovered.value! - (PERFS.topMD - top) * casingCap)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(run.result.diagnostics.map(d => d.code)).not.toContain('PRIMARY_SQUEEZE_FLUID_AHEAD');
  });

  it('expõe todo o revestimento: envelope de pressão interna e comparação com o limite informado', () => {
    const run = compress([{ kind: 'pressurize', durationMin: 10, surfacePressurePsi: 2000 }], { casingBurstPsi: 2500 });
    const envelope = run.result.casingEnvelope;
    expect(envelope[0].md).toBe(0);
    expect(envelope[0].maxPressurePsi).toBeCloseTo(2000, 6);
    // Pressão interna cresce com a profundidade (parado, só hidrostática).
    for (let i = 1; i < envelope.length; i++) expect(envelope[i].maxPressurePsi).toBeGreaterThanOrEqual(envelope[i - 1].maxPressurePsi - 1e-9);
    const burst = run.result.diagnostics.find(d => d.code === 'PRIMARY_SQUEEZE_CASING_BURST')!;
    expect(burst.limit).toBe(2500);
    expect(burst.value!).toBeCloseTo(envelope.at(-1)!.maxPressurePsi, 6);
  });

  it('recusa canhoneado acima da extremidade depois da retirada', () => {
    const run = compress([{ kind: 'pressurize', durationMin: 5, surfacePressurePsi: 500 }],
      { perforations: { topMD: 1700, baseMD: 1710 } });
    expect(run.result.diagnostics.map(d => d.code)).toContain('PRIMARY_SQUEEZE_PERFORATIONS');
    expect(run.result.points).toEqual([]);
  });
});
