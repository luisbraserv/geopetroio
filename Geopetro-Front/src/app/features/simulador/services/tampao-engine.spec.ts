import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { RelatorioBuilderService } from '../components/relatorio/relatorio-builder.service';
import type { DadosRelatorio } from './simulador-state-store.service';
import type { WellGeometry } from '../models/well-geometry.model';
import { ConformidadeOperacionalReportService, type ConformidadeParams } from './conformidade-operacional-report.service';
import { K } from './primary-hydraulics';
import { PrimaryProgramService } from './primary-program.service';
import { TampaoCalculoService } from './tampao-calculo.service';
import { buildTampaoConfiguration, buildTampaoOperationCharts, runTampaoEngine, tampaoLegacyHydraulics,
  TAMPAO_PLUG_BASE_REFERENCE, type TampaoEngineInput } from './tampao-engine';
import { fannPowerLaw } from './work-string-config';
import { profileAt } from './pressure-profile';
import { buildCriticalPoints, wellElementOf } from './operation-critical-points';
import { DEFAULT_MARGIN_CLASSES, type PressureProfileInput } from '../models/pressure-profile.model';

/**
 * Tampão da tela no motor da primária (SPEC squeeze-tampao S4): o dimensionamento de
 * hoje vira o programa da coluna, e o resultado sai nos gráficos comuns e no formato
 * que as métricas e o relatório de conformidade leem. Mesmo poço de T-01 a T-08.
 */
const well: WellGeometry = { finalMD: 2600, finalTVD: 2600, phases: [
  { id: 'surface', name: 'Superfície 12¼"', type: 'SURFACE', topMD: 0, bottomMD: 1000, topTVD: 0, bottomTVD: 1000,
    holeDiameterIn: 12.25, casing: { odIn: 9.625, idIn: 8.681, bottomMD: 1000 } },
  { id: 'open', name: 'Poço aberto 8½"', type: 'PRODUCTION', topMD: 1000, bottomMD: 2600, topTVD: 1000, bottomTVD: 2600,
    holeDiameterIn: 8.5 },
] };
const PLUG_TOP = 2370;
const PLUG_BASE = 2510;
const tvdOf = (md: number) => md;

function plug(backSpacerHeight = 107.17) {
  return TestBed.inject(TampaoCalculoService).calcPlug({
    sectionStartMD: PLUG_TOP, sectionEndMD: PLUG_BASE, sectionStartTVD: PLUG_TOP, sectionEndTVD: PLUG_BASE,
    wellFinalMD: 2600, wellFinalTVD: 2600, holeID: 8.5, pipeOD: 4.5, pipeID: 3.826,
    backSpacerHeight, mudWeightFront: 8.33, mudWeightBack: 8.33, completionWeight: 9,
    fracGrad: 16, poreGrad: 9, pumpRate: 3, surfaceTemp: 80, geoGradient: 1.5,
  }, null, { geometry: well, interval: { topMD: PLUG_TOP, bottomMD: PLUG_BASE } });
}

function input(over: Partial<TampaoEngineInput> = {}): TampaoEngineInput {
  const slurry = fannPowerLaw(181, 132, 79);
  return {
    geometry: well, plug: plug(), pipeODIn: 4.5, pipeIDIn: 3.826,
    densities: { completion: 9, front: 8.33, back: 8.33, displacement: 9, slurry: 15.8 },
    waterViscosityCp: 1, slurryRheology: { ...slurry, origin: 'theta' },
    rates: { front: 3, slurry: 3, back: 3, displacement: 3 }, pausesMin: [0, 0, 0],
    friction: { internal: 'medium', annular: 'medium' }, headCondition: 'vented-free-surface',
    // Poro abaixo da água à frente: com 8,33 ppg no anular a base fica abaixo de 9 ppg.
    poreGradPpg: 8, fracGradPpg: 16,
    equipment: { maxSurfacePressurePsi: 5000, maxPumpRateBpm: 8, motorHp: 1000, pumpEffPct: 90 },
    ...over,
  };
}
const run = (over: Partial<TampaoEngineInput> = {}) =>
  runTampaoEngine(TestBed.inject(PrimaryProgramService), input(over), tvdOf);
const phases = [{ id: 'surface', name: 'Superfície', topMD: 0, bottomMD: 1000 },
  { id: 'open', name: 'Poço aberto', topMD: 1000, bottomMD: 2600 }];

describe('tampão da tela no motor da primária (S4)', () => {
  it('traduz o dimensionamento em programa: volumes de hoje, pausas, deslocamento e drenagem até o equilíbrio', () => {
    const current = input({ pausesMin: [5, 0, 2] });
    const primary = buildTampaoConfiguration(current);
    const steps = primary.stages[0].steps;
    expect(steps.map(step => step.id)).toEqual(['front', 'pause-1', 'slurry', 'back', 'pause-3', 'displace', 'settle']);
    const volume = (id: string) => {
      const step = steps.find(s => s.id === id)!;
      return step.kind === 'pump' && step.quantity.source === 'entered' ? step.quantity.volumeBbl : NaN;
    };
    expect(volume('front')).toBe(current.plug.frontPhysicalVolumeBbl);
    expect(volume('slurry')).toBe(current.plug.volCementTotal);
    expect(volume('back')).toBe(current.plug.backPhysicalVolumeBbl);
    expect(volume('displace')).toBe(current.plug.volDisplacement);
    expect(steps.at(-1)).toMatchObject({ kind: 'pause', untilBalanced: true });
    expect(primary.target).toMatchObject({ kind: 'work-string', shoeMD: PLUG_BASE, floatCollarMD: PLUG_BASE });
    // O atrito da primária: multiplicadores de interior e anular, sem correção de standoff.
    expect(primary.frictionSettings).toEqual({ internal: 'medium', annular: 'medium' });
    // Sem excesso: a pasta é o volume do intervalo em poço cheio.
    expect(current.plug.volCementTotal).toBeCloseTo(0.2303 * 140, 0);
  });

  it('posiciona o tampão nas alturas de projeto e, depois da retirada, o topo é o sem coluna', () => {
    const result = run();
    expect(result.resolution.transport!.status).toBe('complete');
    const parcels = result.resolution.transport!.snapshots.at(-1)!.parcels;
    for (const zone of ['internal', 'casing-annulus']) {
      const top = Math.min(...parcels.filter(p => p.zone === zone && p.fluidId === 'slurry').map(p => p.topMD));
      expect(Math.abs(top - plug().topCementWithTubing)).toBeLessThan(0.1);
    }
    expect(result.retirada.openEndDepthM).toBeCloseTo(PLUG_BASE - 19 * 9.4, 9);
    expect(Math.abs(result.summary.cementTopAfterPullMD! - plug().topCementWithoutTubing)).toBeLessThan(0.1);
    expect(result.summary.settleTimedOut).toBe(false);
    expect(Math.abs(result.summary.residualImbalancePsi!)).toBeLessThan(0.5);
    expect(result.summary.esdBaseAfterPullPpg!).toBeLessThan(result.summary.esdBaseBeforePullPpg!);
  });

  it('subdeslocado, mostra o desbalanço do fim do bombeio, o volume drenado e o tempo até equilibrar', () => {
    const result = runTampaoEngine(TestBed.inject(PrimaryProgramService), input(), tvdOf, { displacementFactor: 0.97 });
    expect(result.summary.imbalanceEndPumpPsi!).toBeGreaterThan(10);
    expect(result.summary.drainedBbl!).toBeGreaterThan(0.1);
    expect(result.summary.settleMin!).toBeGreaterThan(0);
    expect(Math.abs(result.summary.residualImbalancePsi!)).toBeLessThan(0.1 * result.summary.imbalanceEndPumpPsi!);
  });

  it('monta os três gráficos da primária na base do tampão, com o estado depois da retirada como ponto marcado', () => {
    const result = run();
    const charts = buildTampaoOperationCharts(result, phases, 'open', tvdOf)!;
    expect(charts.operation).toBe('tampao');
    expect(charts.references.map(r => r.id)).toEqual([TAMPAO_PLUG_BASE_REFERENCE]);
    const reference = charts.references[0];
    expect(reference.tvd).toBe(PLUG_BASE);
    expect(reference.title).toBe('ECD e pressão hidrostática na base do tampão');
    // Depois da retirada: um ponto marcado, fora da linha do bombeio, no volume do fim do job.
    const marker = reference.marker!;
    expect(marker.label).toBe('Depois da retirada');
    expect(marker.hydrostaticPsi).toBeCloseTo(result.pull!.hydrostaticPsiAt(PLUG_BASE), 9);
    expect(marker.ecdPpg).toBeCloseTo(marker.hydrostaticPsi / (K * PLUG_BASE), 9);
    expect(marker.volumeBbl).toBe(reference.points.at(-1)!.volumeBbl);
    expect(reference.points.every(point => point.hydrostaticPsi !== marker.hydrostaticPsi)).toBe(true);
    expect(reference.axis).toBe('volume');
    // Envelope: duas hidrostáticas mínimas, o perfil e a do poço, e a do poço é o menor do perfil.
    const profile = charts.envelope.map(point => point.minHydrostaticPpg).filter((v): v is number => v !== null);
    expect(charts.envelope.filter(point => point.tvd > 0).every(point => point.minHydrostaticWellPpg === Math.min(...profile))).toBe(true);
    expect(charts.envelopeMarker).toEqual({ label: 'Topo da fase da operação', md: 1000 });
    // Série de volume pelo tempo do transporte: termina no total bombeado e no fim da drenagem.
    const total = charts.volumes.find(series => series.kind === 'total')!;
    expect(total.points.at(-1)!.volumeBbl).toBeCloseTo(result.resolution.transport!.totalPumpedBbl, 9);
    expect(total.points.at(-1)!.timeMin).toBeCloseTo(result.resolution.transport!.totalTimeMin, 9);
    expect(charts.volumes.filter(series => series.kind === 'fluid').map(series => series.id))
      .toEqual(['front', 'slurry', 'back', 'displacement']);
    // Leituras θ: reologia medida, sem aviso.
    expect(charts.rheologyWarning).toBeNull();
    // Janela só onde a formação está exposta: o poço aberto inteiro, abaixo da sapata; nada atrás do revestimento.
    expect(charts.envelope.some(point => point.fracturePpg !== null)).toBe(true);
    const shoe = Math.max(...input().geometry.phases.flatMap(phase => phase.casing ? [phase.casing.bottomMD] : []));
    expect(charts.envelope.filter(point => point.md < shoe - 1e-6).every(point => point.fracturePpg === null && point.porePpg === null)).toBe(true);
    expect(charts.envelope.filter(point => point.md > shoe + 1e-6 && point.tvd > 0).every(point => point.fracturePpg !== null)).toBe(true);
  });

  it('avisa sobre a reologia pela regra da primária: só com a pasta como água de 1 cP', () => {
    const reference = run({ slurryRheology: { ...fannPowerLaw(181, 132, 79), origin: 'estimado' } });
    expect(buildTampaoOperationCharts(reference, phases, 'open', tvdOf)!.rheologyWarning).toBeNull();
    const water = run({ slurryRheology: { n: 1, kLbfSnFt2: 0.000020885, origin: 'base' } });
    expect(buildTampaoOperationCharts(water, phases, 'open', tvdOf)!.rheologyWarning).toContain('água de 1 cP');
  });

  it('entrega à tela e ao relatório de conformidade os números do motor no formato antigo', () => {
    const current = input();
    const result = run();
    const legacy = tampaoLegacyHydraulics(result, current, tvdOf)!;
    const s = legacy.summary;
    expect(s.referenceMD).toBe(PLUG_BASE);
    expect(s.porePsi).toBeCloseTo(K * 8 * PLUG_BASE, 9);
    expect(s.fracturePsi).toBeCloseTo(K * 16 * PLUG_BASE, 9);
    const bhps = result.resolution.hydraulics!.points.map(p => p.bhpPsi!).filter(Number.isFinite);
    expect(s.bhpMaxPsi).toBeCloseTo(Math.max(...bhps), 9);
    expect(s.bhpMinPsi).toBeCloseTo(Math.min(...bhps), 9);
    expect(s.marginToFracturePsi).toBeCloseTo(s.fracturePsi - s.bhpMaxPsi, 9);
    expect(s.alert).toBe('inside-window');
    // Poro igual ao fluido de completação: a água à frente no anular leva a base abaixo do poro.
    const tight = tampaoLegacyHydraulics(run({ poreGradPpg: 9 }), input({ poreGradPpg: 9 }), tvdOf)!;
    expect(tight.summary.alert).toBe('below-pore');
    expect(s.hhpAvailable).toBe(900);
    expect(legacy.points.map(p => p.phase)).toContain('Deslocamento');
    expect(legacy.points.at(-1)!.phase).toBe('Equilíbrio do tampão');
    // Queda livre: a vazão de saída passa da bombeada e o acumulado é a integral do excesso.
    expect(Math.max(...legacy.points.map(p => p.freeFallExtraRateBpm))).toBeGreaterThan(0.5);
    expect(s.freeFallAccumBbl).toBeGreaterThan(0);
    // Enquanto a bomba enche o vazio, a saída fica abaixo da bombeada; nunca negativa (sem retorno pela coluna).
    expect(legacy.points.some(p => p.realRateBpm < p.programmedRateBpm - 0.1)).toBe(true);
    for (const point of legacy.points) expect(point.realRateBpm).toBeGreaterThanOrEqual(0);
  });

  it('varredura de risco: as 12 combinações do relatório (vazão × densidade) rodam no motor novo', async () => {
    const current = input();
    const service = TestBed.inject(PrimaryProgramService);
    const start = performance.now();
    let runs = 0;
    for (const rateFactor of [0.5, 0.7, 0.85, 1])
      for (const density of [15.8, 15.3, 16.3]) {
        const legacy = tampaoLegacyHydraulics(runTampaoEngine(service, current, tvdOf, { rateFactor, density }),
          current, tvdOf);
        expect(legacy).not.toBeNull();
        runs++;
      }
    const elapsed = performance.now() - start;
    expect(runs).toBe(12);
    const target = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['TAMPAO_TIMING'];
    if (target) {
      // Sem tipos do Node no projeto: o especificador em variável passa pela checagem.
      const fsModule = 'node:fs';
      const { writeFileSync } = await import(/* @vite-ignore */ fsModule) as
        { writeFileSync: (path: string, data: string) => void };
      writeFileSync(target, JSON.stringify({ runs, elapsedMs: elapsed }));
    }
  });
});

describe('atrito e ECD como na primária', () => {
  it('multiplica o atrito da coluna e o do anular pelos níveis da primária, sem excentricidade', () => {
    const newtonian = { n: 1, kLbfSnFt2: 30 * 2.0885e-5, origin: 'laboratorio' as const };
    const same = { completion: 9, front: 9, back: 9, displacement: 9, slurry: 9 };
    const at = (internal: 'low' | 'medium' | 'high', annular: 'low' | 'medium' | 'high') =>
      run({ densities: same, slurryRheology: newtonian, friction: { internal, annular }, waterViscosityCp: 30 })
        .resolution.hydraulics!.points.filter(p => p.pumpRateBpm > 0 && p.state === 'full');
    const base = at('low', 'low');
    const annular = at('low', 'high');
    const internal = at('medium', 'low');
    expect(base.length).toBeGreaterThan(5);
    for (let i = 0; i < base.length; i++) {
      // Os multiplicadores da primária: 1,00 / 1,15 / 1,35 (PRIMARY_FRICTION_LEVEL_MULTIPLIER).
      expect(annular[i].annularFrictionPsi!).toBeCloseTo(base[i].annularFrictionPsi! * 1.35, 6);
      expect(annular[i].pipeFrictionPsi!).toBeCloseTo(base[i].pipeFrictionPsi!, 9);
      expect(internal[i].pipeFrictionPsi!).toBeCloseTo(base[i].pipeFrictionPsi! * 1.15, 6);
      expect(internal[i].annularFrictionPsi!).toBeCloseTo(base[i].annularFrictionPsi!, 9);
      // ECD = BHP / (K · TVD), como na primária.
      expect(base[i].ecdPpg!).toBeCloseTo(base[i].bhpPsi! / (0.1706036745 * PLUG_BASE), 6);
    }
  });
});

describe('relatório de conformidade com o motor da primária', () => {
  function report(fator: ConformidadeParams['fator'], over: Partial<ConformidadeParams> = {}): string {
    const current = input();
    const result = run();
    const html: string[] = [];
    vi.spyOn(TestBed.inject(RelatorioBuilderService), 'openInNewTab').mockImplementation(page => { html.push(page); });
    const p = plug();
    TestBed.inject(ConformidadeOperacionalReportService).abrir({
      operacao: 'TAMPÃO', fator, sim: tampaoLegacyHydraulics(result, current, tvdOf)!, dadosRelatorio: {} as DadosRelatorio,
      v: { fracGrad: 16, poreGrad: 8, density: 15.8, standoffPct: 80 },
      placement: { cementTopMD: p.topCementWithoutTubing, cementBaseMD: p.pBase, capBblM: p.cementPhysicalCapacityBblM,
        displacementBbl: p.volDisplacement, targetTopMD: p.topCementWithoutTubing,
        predictedTopMD: result.summary.cementTopAfterPullMD! },
      motor: 'primaria', ...over });
    vi.restoreAllMocks();
    return html[0];
  }

  it('compõe o BHP pelo anular, sem a fricção da coluna', () => {
    const html = report('bhp');
    expect(html).toContain('BHP = P.retorno + P.hidrostática (anular acima da referência) + Fricção anular');
    expect(html).not.toContain('− Fricção coluna + Fricção anular (retorno)');
    expect(html).toContain('Motor da cimentação primária');
  });

  it('usa o topo do motor no movimento de interfaces e simula cada linha do sub-deslocamento', () => {
    const interfaces = report('interfaces');
    expect(interfaces).toContain('Topo da pasta pelo motor da primária');
    expect(interfaces).toContain('Topo da pasta previsto (motor, após a retirada)');
    const service = TestBed.inject(PrimaryProgramService);
    const factors: number[] = [];
    const sub = report('subdeslocamento', { predictTopMD: factor => {
      factors.push(factor);
      return runTampaoEngine(service, input(), tvdOf, { displacementFactor: factor }).summary.cementTopAfterPullMD;
    } });
    expect(factors.length).toBeGreaterThanOrEqual(7);
    expect(factors).toContain(1);
    expect(sub).toContain('Cada linha: bombeio');
  });

  it('queda livre com o motor novo é alerta: reprova só pelo topo final da pasta ou pelo BHP', () => {
    const html = report('freefall');
    expect(html).toContain('✔ OPERACIONAL');
    expect(html).toContain('Topo final da pasta dentro da tolerância');
    expect(html).not.toContain('≤ 50% da vazão programada');
    expect(html).not.toContain('≤ 10% do volume bombeado');
    // O mesmo resultado com o topo final 30 m acima do alvo reprova pelo posicionamento.
    const p = plug();
    const off = report('freefall', { placement: { cementTopMD: p.topCementWithoutTubing, cementBaseMD: p.pBase,
      capBblM: p.cementPhysicalCapacityBblM, displacementBbl: p.volDisplacement, targetTopMD: p.topCementWithoutTubing,
      predictedTopMD: p.topCementWithoutTubing - 30 } });
    expect(off).toContain('✘ NÃO OPERACIONAL');
    // No score, a queda livre não é reprovação dura enquanto o topo estiver no alvo.
    const risk = report('risco');
    expect(risk).toContain('Sem reprovação dura.');
    expect(risk).toContain('alerta; reprova só se o topo final da pasta sair da tolerância, e ele está no alvo');
  });

  it('sem o motor novo, a queda livre continua reprovando pelos limites de 50% e 10%', () => {
    const html = report('freefall', { motor: undefined });
    expect(html).toContain('≤ 50% da vazão programada');
    expect(html).toContain('≤ 10% do volume bombeado');
  });

  it('sem o motor novo, mantém os textos da simulação antiga', () => {
    const html = report('bhp', { motor: undefined });
    expect(html).toContain('BHP = P.superfície + P.hidrostática (coluna) − Fricção coluna + Fricção anular (retorno)');
    expect(html).toContain('fricção Petroguia F-40');
  });

  it('janela operacional: o perfil por TVD vale no poço aberto e o motor guarda o ponto crítico de cada etapa', () => {
    // Fratura menor perto da sapata (1000 m) e maior no fundo: a fraqueza fica no meio do poço.
    const profile: PressureProfileInput = { unit: 'ppg', mode: 'table', pore: 8, fracture: 16,
      points: [{ tvdM: 1000, pore: 7, fracture: 10.5 }, { tvdM: 2600, pore: 7, fracture: 17 }] };
    const result = run({ pressureProfile: profile });
    const hydraulics = result.resolution.hydraulics!;
    const exposed = hydraulics.envelope.filter(p => p.fracturePsi !== null);
    expect(exposed.length).toBeGreaterThan(0);
    // Só no poço aberto (abaixo da sapata de 1000 m), com a fratura do perfil na TVD de cada ponto.
    expect(exposed.every(p => p.md >= 1000 - 1e-6)).toBe(true);
    for (const p of exposed) expect(p.fracturePsi! / (K * p.tvd)).toBeCloseTo(profileAt(profile, p.tvd).fracturePpg, 6);
    // Ponto crítico por etapa: a menor folga até a fratura de cada etapa; a menor de todas é a do motor.
    const steps = hydraulics.criticalByStep!;
    expect(steps.map(step => step.stepId)).toEqual(expect.arrayContaining(['front', 'slurry', 'back', 'displace']));
    for (const step of steps.filter(step => step.fracture))
      expect(step.fracture!.marginPsi).toBeCloseTo(step.fracture!.fracturePsi! - step.fracture!.pressurePsi, 9);
    const smallest = Math.min(...steps.flatMap(step => step.fracture ? [step.fracture.marginPsi] : []));
    expect(smallest).toBeCloseTo(hydraulics.narrowestFractureMargin!.psi, 9);
    // Com a fratura mais baixa em cima, o ponto crítico é a sapata, logo abaixo do revestimento.
    const view = buildCriticalPoints({ hydraulics, stepLabels: { front: 'Água à frente', slurry: 'Pasta', back: 'Água atrás',
      displace: 'Deslocamento', settle: 'Equilíbrio do tampão' }, gradientsAt: tvd => profileAt(profile, tvd), tvdOf,
      elementOf: wellElementOf(well, []), classes: DEFAULT_MARGIN_CLASSES });
    expect(view.worst!.kind).toBe('fracture');
    expect(view.worst!.md).toBeCloseTo(1000, 0);
    expect(view.worst!.elemento).toContain('Sapata');
    expect(view.worst!.fractureMarginPpg!).toBeCloseTo(10.5 - view.worst!.pressurePsi / (K * view.worst!.tvd), 6);
    expect(view.steps.find(step => step.etapa === 'Pasta')).toBeDefined();
    // Sem o perfil, a janela é a de sempre: os gradientes únicos no poço aberto.
    const constant = run().resolution.hydraulics!.envelope.find(p => p.fracturePsi !== null)!;
    expect(constant.fracturePsi! / (K * constant.tvd)).toBeCloseTo(16, 9);
  });
});
