import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BBL_M } from '../models/constantes';
import type { WellGeometry } from '../models/well-geometry.model';
import { K } from './primary-hydraulics';
import { PrimaryProgramService } from './primary-program.service';
import { retainerSqueezeVolumes, runRetainerSqueeze, type RetainerSqueezeInput } from './squeeze-retainer';
import { TampaoCalculoService } from './tampao-calculo.service';
import { runTampaoEngine } from './tampao-engine';
import { resolveSqueezeCompression, type CompressionBlock, type CompressionIsolation } from './work-string-compression';
import { fannPowerLaw, wellWallSections } from './work-string-config';

/**
 * Squeeze com ferramenta no motor da primária (SPEC squeeze-tampao S6, casos T-15 e T-16).
 * Mesmo poço da S5: 7" 26 lb/pé (ID 6,276") até 2000 m, canhoneados de 1850 a 1860 m,
 * coluna 2⅞" 6,5 lb/pé (ID 2,441").
 */
const well: WellGeometry = { finalMD: 2000, finalTVD: 2000, phases: [
  { id: 'surface', name: 'Superfície 12¼"', type: 'SURFACE', topMD: 0, bottomMD: 500, topTVD: 0, bottomTVD: 500,
    holeDiameterIn: 12.25, casing: { odIn: 9.625, idIn: 8.681, bottomMD: 500 } },
  { id: 'production', name: 'Produção 8½"', type: 'PRODUCTION', topMD: 500, bottomMD: 2000, topTVD: 500, bottomTVD: 2000,
    holeDiameterIn: 8.5, casing: { odIn: 7, idIn: 6.276, bottomMD: 2000 } },
] };
const PERFS = { topMD: 1850, baseMD: 1860 };
const tvdOf = (md: number) => md;
const casingCap = BBL_M * 6.276 ** 2;
const stringCap = BBL_M * 2.441 ** 2;
const common = {
  geometry: well, pipeODIn: 2.875, pipeIDIn: 2.441,
  densities: { completion: 9, front: 8.33, back: 8.33, displacement: 9, slurry: 15.8 },
  waterViscosityCp: 1, slurryRheology: { ...fannPowerLaw(181, 132, 79), origin: 'theta' as const },
  rates: { front: 2, slurry: 2, back: 2, displacement: 2 }, friction: { internal: 'medium' as const, annular: 'medium' as const },
  headCondition: 'closed-head' as const, poreGradPpg: 8.5, fracGradPpg: 15,
  equipment: { maxSurfacePressurePsi: null, maxPumpRateBpm: null, motorHp: null, pumpEffPct: null },
};
const sum = (layers: { fluidId: string; volumeBbl: number }[], id: string) =>
  layers.filter(l => l.fluidId === id).reduce((s, l) => s + l.volumeBbl, 0);

describe('squeeze com packer recuperável (T-15)', () => {
  /** Posiciona como o tampão com o bypass aberto, retira até a extremidade do relatório e fixa o packer. */
  function packer(blocks: CompressionBlock[], isolation: Partial<Extract<CompressionIsolation, { kind: 'tool' }>> = {}) {
    const plug = TestBed.inject(TampaoCalculoService).calcPlug({
      sectionStartMD: 1780, sectionEndMD: 1880, sectionStartTVD: 1780, sectionEndTVD: 1880,
      wellFinalMD: 2000, wellFinalTVD: 2000, holeID: 6.276, pipeOD: 2.875, pipeID: 2.441,
      backSpacerHeight: 60, mudWeightFront: 8.33, mudWeightBack: 8.33, completionWeight: 9,
      fracGrad: 15, poreGrad: 8.5, pumpRate: 2, surfaceTemp: 80, geoGradient: 1.5,
    }, null, { geometry: well, interval: { topMD: 1780, bottomMD: 1880 } });
    const tampao = runTampaoEngine(TestBed.inject(PrimaryProgramService), { ...common, plug, pausesMin: [0, 0, 0] }, tvdOf);
    const result = resolveSqueezeCompression({
      segments: tampao.resolution.geometry.fullGeometry.segments, wall: wellWallSections(well, 1880),
      start: tampao.pull!, isolation: { kind: 'tool', tool: 'packer', ...isolation }, fluids: tampao.primary.fluids,
      defaultFluidId: 'displacement', perforations: PERFS, blocks, friction: { internal: 'medium', annular: 'medium' },
      fracGradPpg: 15, poreGradPpg: 8.5, tvdOf, startTimeMin: tampao.summary.totalTimeMin,
      startPumpedBbl: tampao.resolution.transport!.totalPumpedBbl });
    return { tampao, result };
  }
  const program: CompressionBlock[] = [{ kind: 'inject', volumeBbl: 2, rateBpm: 0.5, surfacePressurePsi: 1500 },
    { kind: 'pressurize', durationMin: 10, surfacePressurePsi: 2000 }];

  it('isola o anular acima do packer na contrapressão e dá o diferencial na ferramenta', () => {
    const { tampao, result } = packer(program, { annulusPressurePsi: 500 });
    const pull = tampao.pull!;
    const annulusHydro = pull.annulus.reduce((s, l) => s + K * (l.fluidId === 'front' || l.fluidId === 'back' ? 8.33 : 9) * (l.bottomMD - l.topMD), 0);
    for (const point of result.points) {
      // Acima do packer, o anular não sente a pressão de bombeio.
      expect(point.casingHeadPressurePsi).toBe(500);
      const below = point.references.find(r => r.id === 'open-end')!.pressurePsi;
      expect(point.toolDifferentialPsi!).toBeCloseTo(below - (500 + annulusHydro), 6);
    }
    // Pressurizado a 2000 psi, abaixo do packer: 2000 + coluna de fluidos na coluna.
    const last = result.points.at(-1)!;
    const stringHydro = result.internal.reduce((s, l) => s + K * (l.fluidId === 'front' || l.fluidId === 'back' ? 8.33 : 9) * (l.bottomMD - l.topMD), 0);
    expect(last.references.find(r => r.id === 'open-end')!.pressurePsi).toBeCloseTo(2000 + stringHydro, 6);
    expect(result.annulus).toEqual(pull.annulus);
    expect(result.points.at(-1)!.injectedVolumeBbl).toBeCloseTo(2, 9);
  });

  it('compara o diferencial com o limite da ferramenta; a contrapressão no anular o reduz', () => {
    const low = packer(program, { annulusPressurePsi: 0, differentialLimitPsi: 1800 });
    const warning = low.result.diagnostics.find(d => d.code === 'PRIMARY_SQUEEZE_TOOL_DIFFERENTIAL')!;
    expect(warning.limit).toBe(1800);
    expect(warning.value!).toBeGreaterThan(1800);
    const backed = packer(program, { annulusPressurePsi: 1000, differentialLimitPsi: 1800 });
    expect(backed.result.diagnostics.map(d => d.code)).not.toContain('PRIMARY_SQUEEZE_TOOL_DIFFERENTIAL');
    const diff = (r: typeof low) => Math.max(...r.result.points.map(p => p.toolDifferentialPsi!));
    expect(diff(low) - diff(backed)).toBeCloseTo(1000, 6);
  });

  it('só o revestimento abaixo do packer fica sob a pressão de bombeio', () => {
    const tool = packer(program, { annulusPressurePsi: 0 }).result;
    const bradenhead = resolveSqueezeCompression({ ...packerInput(), isolation: { kind: 'bradenhead' } });
    const at = (r: typeof tool, md: number) => r.casingEnvelope.find(p => p.md === md)!.maxPressurePsi;
    expect(at(tool, 0)).toBeCloseTo(0, 9);
    expect(at(bradenhead, 0)).toBeGreaterThan(1900);
    expect(at(tool, 1880)).toBeCloseTo(at(bradenhead, 1880), 6);
  });

  function packerInput() {
    const { tampao } = packer(program);
    return { segments: tampao.resolution.geometry.fullGeometry.segments, wall: wellWallSections(well, 1880),
      start: tampao.pull!, fluids: tampao.primary.fluids, defaultFluidId: 'displacement', perforations: PERFS,
      blocks: program, friction: { internal: 'medium' as const, annular: 'medium' as const }, fracGradPpg: 15,
      poreGradPpg: 8.5, tvdOf, startTimeMin: 0, startPumpedBbl: 0 };
  }
});

describe('squeeze com retentor perfurável (T-16)', () => {
  const base: Omit<RetainerSqueezeInput, 'blocks'> = {
    ...common, retainerMD: 1830, bottomMD: 2000, perforations: PERFS,
    volumes: { injectBbl: 5, frontBbl: 5, backBbl: 2 },
  };
  const run = (blocks: RetainerSqueezeInput['blocks']) =>
    runRetainerSqueeze(TestBed.inject(PrimaryProgramService), { ...base, blocks }, tvdOf);
  /** Com o stinger encaixado, bombeia o que falta do deslocamento e pressuriza. */
  const squeeze: RetainerSqueezeInput['blocks'] = plan => [
    { kind: 'inject', volumeBbl: plan.squeezeDisplacementBbl, rateBpm: 0.5, surfacePressurePsi: 1000 },
    { kind: 'pressurize', durationMin: 15, surfacePressurePsi: 1500 }];

  it('dimensiona a pasta com o revestimento abaixo do retentor e o deslocamento pela capacidade da coluna', () => {
    const volumes = retainerSqueezeVolumes(well, { ...base });
    expect(volumes.belowRetainerBbl).toBeCloseTo(30 * casingCap, 9);
    expect(volumes.belowRetainerBbl).toBeCloseTo(3.766, 3);
    expect(volumes.slurryBbl).toBeCloseTo(5 + 30 * casingCap, 9);
    expect(volumes.stringCapacityBbl).toBeCloseTo(1830 * stringCap, 9);
    expect(volumes.stringCapacityBbl).toBeCloseTo(34.75, 2);
    expect(volumes.totalDisplacementBbl).toBeCloseTo(1830 * stringCap - 2, 9);
    expect(volumes.spotDisplacementBbl).toBeCloseTo(1830 * stringCap - volumes.slurryBbl - 2, 9);
  });

  it('posiciona com o stinger desencaixado até a frente da pasta chegar ao retentor', () => {
    const result = run(squeeze);
    expect(Math.abs(result.slurryAboveRetainerBbl - result.gapBbl)).toBeLessThanOrEqual(0.01);
    expect(result.slurryAboveRetainerBbl).toBeLessThan(0.05);
    // A queda livre adianta a pasta: o deslocamento antes de encaixar fica menor que o de projeto.
    expect(result.spotDisplacementBbl).toBeLessThanOrEqual(result.volumes.spotDisplacementBbl + 1e-9);
    // A água à frente circulou pelo anular acima do retentor; abaixo dele, só o fluido inicial.
    // (o resíduo entre a frente da pasta e o retentor fica dentro da tolerância do ajuste)
    expect(sum(result.start.annulus, 'front') + sum(result.start.internal, 'front')).toBeCloseTo(5, 9);
    expect(sum(result.start.internal, 'front')).toBeLessThanOrEqual(result.gapBbl + 1e-9);
    expect(result.start.wellbore).toEqual([expect.objectContaining({ fluidId: 'completion', topMD: 1830, bottomMD: 2000 })]);
    expect(result.diagnostics.map(d => d.code)).not.toContain('PRIMARY_RETAINER_SPOT');
  });

  it('T-16: encaixado, só o fluido abaixo do retentor entra antes da pasta, e o deslocamento não passa dele', () => {
    const result = run(squeeze);
    const { compression } = result;
    const ahead = compression.diagnostics.find(d => d.code === 'PRIMARY_SQUEEZE_FLUID_AHEAD')!;
    expect(ahead.value!).toBeCloseTo(result.volumes.belowRetainerBbl + result.gapBbl, 6);
    // Antes da pasta: o fluido abaixo do retentor e o resíduo do ajuste (≤ 0,01 bbl).
    const others = Object.entries(compression.injectedByFluid).filter(([id]) => id !== 'completion' && id !== 'slurry');
    expect(others.every(([, volume]) => volume <= 0.01)).toBe(true);
    expect(compression.injectedByFluid['completion']).toBeGreaterThanOrEqual(result.volumes.belowRetainerBbl - 1e-9);
    // A pasta que entra na formação é o volume a injetar, menos o que passou para o anular.
    expect(compression.injectedByFluid['slurry']).toBeCloseTo(5 - result.slurryAboveRetainerBbl, 1);
    // No fim, a pasta cobre do retentor à base dos canhoneados, e a água atrás fica na coluna.
    const slurry = compression.wellbore.filter(l => l.fluidId === 'slurry');
    expect(Math.min(...slurry.map(l => l.topMD))).toBeCloseTo(1830, 6);
    expect(Math.max(...slurry.map(l => l.bottomMD))).toBeCloseTo(PERFS.baseMD, 6);
    expect(result.diagnostics.map(d => d.code)).not.toContain('PRIMARY_RETAINER_OVERDISPLACED');
    expect(sum(compression.internal, 'back')).toBeCloseTo(2, 1);
    // Anular isolado no retentor, sem contrapressão.
    for (const point of compression.points) expect(point.casingHeadPressurePsi).toBe(0);
    // Conservação por fluido desde o encaixe.
    for (const id of ['completion', 'front', 'slurry', 'back', 'displacement']) {
      const before = sum([...result.start.internal, ...result.start.annulus, ...result.start.wellbore], id);
      const after = sum([...compression.internal, ...compression.annulus, ...compression.wellbore], id);
      expect(Math.abs(before + (compression.pumpedByFluid[id] ?? 0) - after - (compression.injectedByFluid[id] ?? 0))).toBeLessThan(1e-8);
    }
  });

  it('com o vazio da queda livre na coluna, o bombeio primeiro o enche, sem vazão nem atrito no percurso', () => {
    const result = run(squeeze);
    expect(result.start.voidBbl).toBeGreaterThan(0.5);
    // A queda livre adiantou a pasta exatamente o vazio: o deslocamento antes de encaixar é o de projeto menos ele.
    expect(result.spotDisplacementBbl).toBeCloseTo(result.volumes.spotDisplacementBbl - result.start.voidBbl, 1);
    const filling = result.compression.points.filter(p => p.kind === 'fill');
    expect(filling.length).toBeGreaterThan(0);
    for (const point of filling) {
      expect(point.stringFrictionPsi + point.casingFrictionPsi).toBe(0);
      expect(point.injectedVolumeBbl).toBe(0);
    }
    expect(result.compression.voidBbl).toBeLessThan(1e-9);
  });

  it('avisa quando o bombeio com o stinger encaixado passa do deslocamento total', () => {
    const result = run(plan => [{ kind: 'inject', volumeBbl: plan.squeezeDisplacementBbl + 3, rateBpm: 0.5, surfacePressurePsi: 1000 }]);
    const warning = result.diagnostics.find(d => d.code === 'PRIMARY_RETAINER_OVERDISPLACED')!;
    expect(warning.value!).toBeGreaterThan(0.5);
  });
});
