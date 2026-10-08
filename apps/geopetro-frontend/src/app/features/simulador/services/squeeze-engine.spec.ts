import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BBL_M } from '../models/constantes';
import type { SqueezeInputs } from '../models/squeeze.model';
import type { WellGeometry } from '../models/well-geometry.model';
import { K } from './primary-hydraulics';
import { PrimaryProgramService } from './primary-program.service';
import { retiradaTubos } from './retirada-tubos';
import { SqueezeCalculoService } from './squeeze-calculo.service';
import { balancedSqueezeDisplacement, buildSqueezeOperationCharts, legacySqueezeBlocks, runSqueezeEngine,
  squeezeFractureRisk, squeezeInjectionFields, squeezeLegacyHydraulics, SQUEEZE_REFERENCE_OPEN_END, SQUEEZE_REFERENCE_PERFORATIONS,
  type SqueezeEngineInput, type SqueezeTechnique } from './squeeze-engine';
import { runTampaoEngine } from './tampao-engine';
import type { CompressionBlock } from './work-string-compression';
import { fannPowerLaw } from './work-string-config';
import { buildCriticalPoints, wellElementOf } from './operation-critical-points';
import { gradientsAt, profileAt } from './pressure-profile';
import { DEFAULT_MARGIN_CLASSES, type PressureProfileInput } from '../models/pressure-profile.model';

/**
 * Squeeze da tela no motor da primária (SPEC squeeze-tampao S7). O poço é o exemplo da
 * tela: 13⅜" até 300 m e 5½" (ID 4,778") até 1500 m; pasta de 1400 a 1500 m com coluna
 * 2⅞" (ID 2,441"); canhoneados de 1420 a 1440 m; 2 bbl a injetar.
 */
const well: WellGeometry = { finalMD: 1500, finalTVD: 1500, phases: [
  { id: 'phase-1', name: 'Superfície', type: 'SURFACE', topMD: 0, bottomMD: 300, topTVD: 0, bottomTVD: 300,
    holeDiameterIn: 17.5, casing: { odIn: 13.375, idIn: 12.415, bottomMD: 300 } },
  { id: 'phase-2', name: 'Produção', type: 'PRODUCTION', topMD: 300, bottomMD: 1500, topTVD: 300, bottomTVD: 1500,
    holeDiameterIn: 8.535, casing: { odIn: 5.5, idIn: 4.778, bottomMD: 1500 } },
] };
const perforations = [{ top: 1420, base: 1440 }];
const tvdOf = (md: number) => md;
const casingCap = BBL_M * 4.778 ** 2;
const pipeCap = BBL_M * 2.441 ** 2;
const annulusCap = BBL_M * (4.778 ** 2 - 2.875 ** 2);

function geom(injectBbl = 2) {
  const inputs = { sectionStartMD: 1400, sectionEndMD: 1500, sectionStartTVD: 1400, sectionEndTVD: 1500,
    wellFinalMD: 1500, wellFinalTVD: 1500, caliper: 8.535, casingOD: 5.5, casingID: 4.778, tubingOD: 2.875, tubingID: 2.441,
    backSpacerHeight: 50, mudWeightFront: 8.4, mudWeightBack: 8.4, completionWeight: 8.4, displacementWeight: 8.4,
    fracGrad: 16, poreGrad: 8, pumpRate: 2, surfaceTemp: 80, geoGradient: 1.5, expectedLoss: injectBbl } as SqueezeInputs;
  return TestBed.inject(SqueezeCalculoService).calcVolumes(inputs, perforations, null,
    { geometry: well, interval: { topMD: 1400, bottomMD: 1500 } });
}
const blocks: CompressionBlock[] = [{ kind: 'inject', volumeBbl: 2, rateBpm: 0.5, surfacePressurePsi: 1000 },
  { kind: 'pressurize', durationMin: 15, surfacePressurePsi: 1200 }];
function input(technique: SqueezeTechnique, over: Partial<SqueezeEngineInput> = {}): SqueezeEngineInput {
  return {
    technique, geom: geom(), geometry: well, perforations, referenceMD: 1430, blocks,
    pipeODIn: 2.875, pipeIDIn: 2.441,
    densities: { completion: 8.4, front: 8.4, back: 8.4, displacement: 8.4, slurry: 15.8 },
    waterViscosityCp: 1, slurryRheology: { ...fannPowerLaw(181, 132, 79), origin: 'theta' },
    rates: { front: 2, slurry: 2, back: 2, displacement: 2 }, pausesMin: [0, 0, 0],
    friction: { internal: 'low', annular: 'low' }, headCondition: 'closed-head', poreGradPpg: 8, fracGradPpg: 16,
    equipment: { maxSurfacePressurePsi: 5000, maxPumpRateBpm: 8, motorHp: 1000, pumpEffPct: 90 },
    ...(technique === 'retainer' ? { retainer: { md: 1410, bottomMD: 1500 } } : {}),
    ...over,
  };
}
const run = (technique: SqueezeTechnique, over: Partial<SqueezeEngineInput> = {}) =>
  runSqueezeEngine(TestBed.inject(PrimaryProgramService), input(technique, over), tvdOf);

describe('squeeze da tela no motor da primária (S7)', () => {
  it('equilibra a pasta inteira no posicionamento; o deslocamento de hoje deixaria o anular mais pesado', () => {
    const g = geom();
    const balanced = balancedSqueezeDisplacement(well, g);
    // A geometria da tela já equilibra a pasta inteira; a de antes deixava a pasta a injetar
    // no anular: deslocava Ctp · 2 / (Can + Ctp) a mais.
    expect(balanced.displacementBbl).toBeCloseTo(g.operationalDisplacementVolumeBbl, 6);
    const before = g.operationalDisplacementVolumeBbl + pipeCap * 2 / (annulusCap + pipeCap);
    expect(balanced.topWithoutStringMD).toBeCloseTo(1500 - g.slurryTotal / casingCap, 6);
    const result = run('bradenhead');
    const codes = (r: { positioning: typeof result.positioning }) =>
      (r.positioning.hydraulics?.diagnostics ?? []).map(d => d.code);
    expect(codes(result)).not.toContain('PRIMARY_WORKSTRING_BACKFLOW');
    // Com o deslocamento de hoje, o motor avisa o retorno pela coluna (anular mais pesado).
    const today = runTampaoEngine(TestBed.inject(PrimaryProgramService), { ...input('bradenhead'),
      plug: { pTop: 1400, pBase: 1500, frontPhysicalVolumeBbl: g.frontPhysicalVolumeBbl, volCementTotal: g.slurryTotal,
        backPhysicalVolumeBbl: g.backPhysicalVolumeBbl, volDisplacement: before,
        topCementWithoutTubing: g.topCementAfterInjectionMD, capPipe: g.tubingID_m } }, tvdOf);
    expect((today.resolution.hydraulics?.diagnostics ?? []).map(d => d.code)).toContain('PRIMARY_WORKSTRING_BACKFLOW');
  });

  it('Bradenhead: retira até a extremidade do relatório, comprime e deixa o tampão menos o injetado', () => {
    const result = run('bradenhead');
    const g = geom();
    const expectedEnd = retiradaTubos({ baseDepthMD: 1500, cementTopMD: 1500 - g.slurryTotal / casingCap }).openEndDepthM;
    expect(result.summary.toolMD).toBeCloseTo(expectedEnd, 9);
    expect(result.summary.cementTopBeforeSqueezeMD!).toBeGreaterThan(result.summary.toolMD!);
    expect(result.summary.injectedSlurryBbl).toBeCloseTo(2, 6);
    // O tampão enche o intervalo (1400 m); os 2 bbl injetados saem dele e o topo desce
    // 2 / Ccasing = 27,5 m (SPEC squeeze-tampao §2.1).
    expect(result.summary.cementTopAfterSqueezeMD!).toBeCloseTo(1400 + 2 / casingCap, 1);
    expect(result.summary.maxCasingHeadPsi!).toBeGreaterThan(1100);
    expect(result.summary.highPressure).toBe(false);
  });

  it('packer: o anular acima dele fica na contrapressão', () => {
    const result = run('packer', { annulusPressurePsi: 300 });
    expect(result.summary.maxCasingHeadPsi).toBe(300);
    expect(result.summary.maxToolDifferentialPsi!).toBeGreaterThan(800);
    expect(result.summary.cementTopAfterSqueezeMD!).toBeCloseTo(1400 + 2 / casingCap, 1);
  });

  it('retentor: os blocos são a pasta que entra na formação; antes dela, só o fluido abaixo do retentor', () => {
    const result = run('retainer');
    expect(result.summary.toolMD).toBe(1410);
    expect(result.summary.injectedSlurryBbl).toBeCloseTo(2, 1);
    expect(result.summary.fluidAheadBbl).toBeCloseTo(30 * casingCap + result.retainer!.gapBbl, 6);
    expect(result.diagnostics.map(d => d.code)).not.toContain('PRIMARY_RETAINER_OVERDISPLACED');
    // A pasta cobre do retentor à base dos canhoneados.
    expect(result.summary.cementTopAfterSqueezeMD!).toBeCloseTo(1410, 6);
  });

  it('monta os gráficos com o seletor entre canhoneados e extremidade e a série do injetado', () => {
    const result = run('bradenhead');
    const charts = buildSqueezeOperationCharts(result, [{ id: 'phase-1', name: 'Superfície', topMD: 0, bottomMD: 300 },
      { id: 'phase-2', name: 'Produção', topMD: 300, bottomMD: 1500 }], 'phase-2', tvdOf)!;
    expect(charts.operation).toBe('squeeze');
    expect(charts.references.map(r => r.id)).toEqual([SQUEEZE_REFERENCE_PERFORATIONS, SQUEEZE_REFERENCE_OPEN_END]);
    expect(charts.references[0].title).toBe('ECD e pressão hidrostática nos canhoneados');
    expect(charts.references[1].tvd).toBeCloseTo(result.summary.toolMD!, 9);
    // Na compressão, a ECD nos canhoneados sobe com a pressão aplicada.
    const last = charts.references[0].points.at(-1)!;
    expect(last.ecdPpg! - last.hydrostaticPpg!).toBeCloseTo(1200 / (K * 1430), 6);
    const injected = charts.volumes.find(s => s.kind === 'extra')!;
    expect(injected.label).toBe('Injetado na formação');
    expect(injected.points.at(-1)!.volumeBbl).toBeCloseTo(2, 6);
    const total = charts.volumes.find(s => s.kind === 'total')!;
    expect(total.points.at(-1)!.volumeBbl).toBeCloseTo(result.positioning.transport!.totalPumpedBbl + 2, 6);
    // O ΔECD é só o atrito; a pressão aplicada fica à parte, e o eixo é o tempo.
    const perfs = charts.references[0];
    expect(last.appliedPressurePsi).toBeCloseTo(1200, 9);
    expect(Math.abs(last.deltaEcdPpg!)).toBeLessThan(0.05);
    expect(perfs.summary.maxAppliedPressurePsi).toBeCloseTo(1200, 9);
    expect(perfs.summary.maxDeltaEcdPpg!).toBeLessThan(0.5);
    expect(perfs.axis).toBe('time');
    expect(perfs.points.every((p, i) => i === 0 || p.timeMin >= perfs.points[i - 1].timeMin - 1e-9)).toBe(true);
    expect(perfs.bands![0].label).toContain('1200 psi');
    expect(perfs.marker!.label).toBe('Depois da retirada');
    // Envelope: a compressão é série própria, só onde há formação exposta; o ECD máximo é o do bombeio.
    const at = (md: number) => charts.envelope.reduce((a, b) => Math.abs(b.md - md) < Math.abs(a.md - md) ? b : a);
    expect(at(1430).compressionEcdPpg!).toBeGreaterThan(at(1430).fracturePpg! - 5);
    expect(at(1430).maxEcdPpg!).toBeLessThan(at(1430).compressionEcdPpg! - 1);
    expect(at(1430).fracturePpg).toBeCloseTo(16, 6);
    expect(at(150).compressionEcdPpg).toBeNull();
    // Poro e fratura só nos canhoneados: atrás do revestimento, sem janela.
    expect(at(150).fracturePpg).toBeNull();
    expect(at(150).maxEcdPpg!).toBeLessThan(12);
  });

  it('entrega ao relatório de conformidade a injeção e a pressurização com a pressão nos canhoneados', () => {
    const result = run('bradenhead');
    const legacy = squeezeLegacyHydraulics(result, tvdOf)!;
    const phases = [...new Set(legacy.points.map(p => p.phase))];
    expect(phases).toContain('Injeção 1');
    expect(phases).toContain('Pressurização 1');
    expect(legacy.summary.referenceMD).toBe(1430);
    expect(legacy.summary.maxSurfacePressurePsi).toBe(1200);
    const injection = legacy.points.filter(p => p.phase === 'Injeção 1').at(-1)!;
    expect(injection.injectedVolumeBbl).toBeCloseTo(2, 6);
    expect(injection.bhpPsi).toBeCloseTo(result.compression!.points.filter(p => p.kind === 'inject').at(-1)!
      .references.find(r => r.id === SQUEEZE_REFERENCE_PERFORATIONS)!.pressurePsi, 9);
  });

  it('abre um cenário antigo como Bradenhead: uma injeção com o volume, a pressão e o tempo de hoje', () => {
    expect(legacySqueezeBlocks({ volMaxInjetadoBbl: 2, pressaoOperacao: 2000, tempoPressurizacaoMin: 10 }))
      .toEqual([{ kind: 'inject', volumeBbl: 2, rateBpm: 0.2, surfacePressurePsi: 2000 }]);
    // Tempo zero: como hoje, o mínimo de 1 min.
    expect(legacySqueezeBlocks({ volMaxInjetadoBbl: 2, pressaoOperacao: 2000, tempoPressurizacaoMin: 0 }))
      .toEqual([{ kind: 'inject', volumeBbl: 2, rateBpm: 2, surfacePressurePsi: 2000 }]);
    expect(legacySqueezeBlocks({ volMaxInjetadoBbl: 0, pressaoOperacao: 1500, tempoPressurizacaoMin: 30 }))
      .toEqual([{ kind: 'pressurize', durationMin: 30, surfacePressurePsi: 1500 }]);
    expect(squeezeInjectionFields(blocks)).toEqual({ volMaxInjetadoBbl: 2, pressaoOperacao: 1200, tempoPressurizacaoMin: 19 });
  });

  it('a varredura de risco do relatório roda as 12 combinações (vazão × densidade) no motor novo', () => {
    const service = TestBed.inject(PrimaryProgramService);
    const current = input('bradenhead');
    let runs = 0;
    for (const rateFactor of [0.5, 0.7, 0.85, 1])
      for (const density of [15.8, 15.3, 16.3]) {
        expect(squeezeLegacyHydraulics(runSqueezeEngine(service, current, tvdOf, { rateFactor, density }), tvdOf)).not.toBeNull();
        runs++;
      }
    expect(runs).toBe(12);
  }, 60_000);

  it('risco de fratura: a curva passa da fratura quando a pressão de superfície passa do limite do motor', () => {
    // 2000 psi na superfície, acima do limite de baixa pressão: fratura na compressão.
    const high = run('bradenhead', { blocks: [{ kind: 'inject', volumeBbl: 2, rateBpm: 0.5, surfacePressurePsi: 2000 }] });
    const risk = squeezeFractureRisk(high, tvdOf)!;
    const comp = high.compression!.points;
    // Na compressão, a folga até a fratura é a do motor: o limite de superfície menos a aplicada.
    risk.points.slice(-comp.length).forEach((p, i) =>
      expect(p.fracturePsi - p.pressurePsi).toBeCloseTo(comp[i].maxLowPressureSurfacePsi - comp[i].surfacePressurePsi, 6));
    expect(risk.surfaceLimitPsi).toBeCloseTo(high.summary.lowPressureLimitPsi!, 9);
    expect(high.summary.highPressure).toBe(true);
    expect(risk.fractureStart).not.toBeNull();
    expect(risk.fractureStart!.surfacePressurePsi).toBe(2000);
    expect(risk.compression!.from).toBeCloseTo(comp[0].timeMin, 9);
    // No posicionamento, sem pressão aplicada, a borda é a fratura no ponto mais crítico do intervalo.
    const first = risk.points[0];
    expect(first.surfacePressurePsi).toBe(0);
    expect(first.porePsi).toBeCloseTo(K * 8 * 1430, 9);
    expect(first.fracturePsi).toBeLessThanOrEqual(K * 16 * 1430 + 1e-6);
    // Abaixo do limite (arredondado para baixo), a curva fica na janela.
    const psi = Math.floor(high.summary.lowPressureLimitPsi! / 50) * 50;
    const low = run('bradenhead', { blocks: [{ kind: 'inject', volumeBbl: 2, rateBpm: 0.5, surfacePressurePsi: psi }] });
    const inside = squeezeFractureRisk(low, tvdOf)!;
    expect(low.summary.highPressure).toBe(false);
    expect(inside.fractureStart).toBeNull();
    expect(inside.points.every(p => p.pressurePsi <= p.fracturePsi + 1e-6)).toBe(true);
    // O gráfico vai junto com os da primária.
    const charts = buildSqueezeOperationCharts(high, [{ id: 'p', name: 'Produção', topMD: 0, bottomMD: 1500 }], 'p', tvdOf)!;
    expect(charts.fractureRisk!.fractureStart).toEqual(risk.fractureStart);
  });

  it('janela operacional: a fratura do perfil nos canhoneados muda o limite da compressão e o ponto crítico', () => {
    // Fratura de 16 ppg na superfície caindo para 14 ppg a 1500 m: nos canhoneados (1420–1440 m), ~14,1 ppg.
    const profile: PressureProfileInput = { unit: 'psi/ft', mode: 'table', pore: 0, fracture: 0,
      points: [{ tvdM: 0, pore: 0.416, fracture: 0.832 }, { tvdM: 1500, pore: 0.416, fracture: 0.728 }] };
    const constant = run('bradenhead');
    const profiled = run('bradenhead', { pressureProfile: profile });
    const fracAtTop = profileAt(profile, 1420).fracturePpg;
    expect(fracAtTop).toBeCloseTo(14.107, 3);
    // O limite de superfície cai com a fratura menor nos canhoneados.
    expect(profiled.summary.lowPressureLimitPsi!).toBeLessThan(constant.summary.lowPressureLimitPsi! - 100);
    // No fim da pressurização (coluna cheia), a folga do motor é a fratura do perfil na profundidade crítica menos a pressão ali.
    const p = profiled.compression!.points.at(-1)!;
    expect(p.criticalMD).toBeGreaterThanOrEqual(1420);
    expect(p.criticalMD).toBeLessThanOrEqual(1440);
    expect(p.maxLowPressureSurfacePsi - p.surfacePressurePsi)
      .toBeCloseTo(K * profileAt(profile, p.criticalMD).fracturePpg * p.criticalMD - p.criticalPressurePsi, 6);
    // A janela do motor nos canhoneados sai do perfil (exposta, com topo e base).
    const envelope = profiled.positioning.hydraulics!.envelope.filter(e => e.fracturePsi !== null);
    expect(envelope.every(e => e.md >= 1420 - 1e-6 && e.md <= 1440 + 1e-6)).toBe(true);
    for (const e of envelope) expect(e.fracturePsi! / (K * e.tvd)).toBeCloseTo(profileAt(profile, e.tvd).fracturePpg, 6);
    // Ponto crítico com a compressão como etapa própria e a ruptura do revestimento, quando informada.
    const burst = run('bradenhead', { pressureProfile: profile, casingBurstPsi: 3000 });
    const view = buildCriticalPoints({ hydraulics: burst.positioning.hydraulics, stepLabels: {}, compression: burst.compression,
      gradientsAt: tvd => gradientsAt(burst.input, tvd), tvdOf, elementOf: wellElementOf(well, perforations),
      classes: DEFAULT_MARGIN_CLASSES, casingBurstPsi: 3000 });
    const compression = view.steps.find(step => step.etapa === 'Compressão')!;
    expect(compression.fracture!.elemento).toContain('Canhoneado');
    expect(compression.fracture!.fractureMarginPsi).toBeCloseTo(Math.min(...burst.compression!.points
      .map(q => K * profileAt(profile, q.criticalMD).fracturePpg * q.criticalMD - q.criticalPressurePsi)), 6);
    expect(view.casing!.burstPsi).toBe(3000);
    expect(view.casing!.pressurePsi).toBeCloseTo(Math.max(...burst.compression!.casingEnvelope.map(e => e.maxPressurePsi)), 9);
  });
});
