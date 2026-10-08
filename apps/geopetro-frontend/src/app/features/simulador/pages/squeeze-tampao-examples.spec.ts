import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BBL_M } from '../models/constantes';
import { hydrateAditivosFromCatalog, type Aditivo } from '../models/aditivo.model';
import { scenarioForm, scenarioPayload } from '../models/poco.model';
import type { SqueezeGeometry, SqueezeInputs } from '../models/squeeze.model';
import { SqueezeHydraulicSimulationService } from '../services/squeeze-hydraulic-simulation.service';
import { SimuladorSqueezeComponent } from './simulador-squeeze/simulador-squeeze.component';
import { SimuladorTampaoComponent } from './simulador-tampao/simulador-tampao.component';
import { SQUEEZE_EXAMPLE, TAMPAO_EXAMPLE, type SimulatorExample } from './squeeze-tampao-examples.fixture';

/**
 * Cenários de exemplo (SPEC squeeze-tampao S8): carregados na página como um cenário
 * salvo, conferidos à mão e contra o motor antigo onde os dois devem coincidir, e
 * reabertos pelo formato do banco com o mesmo resultado. Com `SQUEEZE_TAMPAO_DUMP`,
 * grava os dois no formato de `simulador_cenarios`.
 */
type Page = SimuladorTampaoComponent | SimuladorSqueezeComponent;

/** Abre a página num módulo novo, como abrir a tela de novo (o valor salvo não depende do anterior). */
function open<T extends Page>(component: new (...args: never[]) => T): T {
  TestBed.resetTestingModule();
  localStorage.clear();
  TestBed.configureTestingModule({ providers: [component, { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } }] });
  const page = TestBed.inject(component as never) as T;
  page.ngOnInit();
  return page;
}
function load(page: Page, example: SimulatorExample): void {
  page.onCarregarEstado({ ...page.form.getRawValue(), ...example.form,
    _dadosRelatorio: { ...page.dadosRelatorio, ...example.dadosRelatorio } });
}
/** O que o modal de cenários grava: `scenarioPayload` do valor que a página entrega. */
function saved(page: Page): ReturnType<typeof scenarioPayload> {
  let value: Record<string, unknown> = {};
  (page as unknown as { stateModal: unknown }).stateModal = { setCurrentForm: (v: Record<string, unknown>) => { value = v; } };
  page.openStateModal();
  return scenarioPayload(value);
}
const dumps: Record<string, { nome: string; operacao: string; formValue: string }> = {};

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('cenários de exemplo do tampão e do squeeze (S8)', () => {
  it('tampão: pasta de 15,8 ppg no intervalo, topo no alvo depois da retirada, reabre igual', () => {
    const page = open(SimuladorTampaoComponent);
    load(page, TAMPAO_EXAMPLE);
    expect(page.wellIssues).toEqual([]);
    expect(page.operationIssues).toEqual([]);
    expect(page.slurry!.density).toBeCloseTo(15.8, 6);
    // Sem excesso: a pasta é o intervalo de 140 m em 8½".
    expect(page.plug!.volCementTotal).toBeCloseTo(140 * BBL_M * 8.5 ** 2, 6);
    const result = page.tampaoResult!;
    expect(result.resolution.transport!.status).toBe('complete');
    expect(Math.abs(result.summary.cementTopAfterPullMD! - 2370)).toBeLessThan(0.1);
    expect(page.engineDiagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(page.hydraulicSim!.summary.alert).toBe('inside-window');

    // Contra o motor antigo: mesmas etapas, volumes e vazões dão o mesmo tempo e o mesmo
    // volume bombeado; a drenagem até o equilíbrio (tampão balanceado) é desprezível.
    const plug = page.plug!;
    const v = page.form.getRawValue();
    const legacy = TestBed.inject(SqueezeHydraulicSimulationService).simulate({
      tubingID_m: plug.capPipe, annulusCasing_m: plug.capAnn, tID: v.pipeID, cID: v.holeID, tOD: v.pipeOD,
      frontPhysicalVolumeBbl: plug.frontPhysicalVolumeBbl, slurryTotal: plug.volCementTotal, volBackSpacer: plug.volBackSpacer,
      operationalDisplacementVolumeBbl: plug.volDisplacement, slurryInjectedVolumeBbl: 0 } as SqueezeGeometry, page.slurry!,
      { ...v, modoOperacao: 'tampao', rugosidadeTubo: v.internalFrictionLevel, topoCanhoneadoMD: plug.pTop, baseCanhoneadoMD: plug.pBase,
        profundidadeReferenciaSqueezeMD: plug.pBase, vazaoAguaFrenteBpm: 3, vazaoPastaBpm: 3, vazaoAguaAtrasBpm: 3,
        vazaoDeslocamentoBpm: 3 } as SqueezeInputs, [], hydrateAditivosFromCatalog((v.additivos || []) as Aditivo[]),
      { thetaReadings: (page as any).estimatedThetaReadings() }, { geometry: page.wellGeometry!, interval: { topMD: plug.pTop, bottomMD: plug.pBase } });
    expect(result.summary.drainedBbl!).toBeLessThan(0.01);
    expect(page.hydraulicSim!.summary.totalTimeMin).toBeCloseTo(legacy.summary.totalTimeMin, 1);
    expect(result.resolution.transport!.totalPumpedBbl).toBeCloseTo(legacy.points.at(-1)!.pumpedVolumeBbl, 6);

    const payload = saved(page);
    const reopened = open(SimuladorTampaoComponent);
    reopened.onCarregarEstado(scenarioForm({ formValue: payload.formValue }));
    expect(reopened.tampaoResult!.summary.cementTopAfterPullMD).toBeCloseTo(result.summary.cementTopAfterPullMD!, 9);
    expect(reopened.hydraulicSim!.summary.bhpMaxPsi).toBeCloseTo(page.hydraulicSim!.summary.bhpMaxPsi, 9);
    expect(reopened.dadosRelatorio.poco).toBe('EX-TAMPAO-01');
    dumps['tampao'] = { nome: TAMPAO_EXAMPLE.nome, operacao: 'tampao', formValue: payload.formValue };
  });

  it('squeeze Bradenhead: 3 bbl de pasta na formação em hesitação, abaixo da fratura, reabre igual', () => {
    const page = open(SimuladorSqueezeComponent);
    load(page, SQUEEZE_EXAMPLE);
    expect(page.wellIssues).toEqual([]);
    expect(page.operationIssues).toEqual([]);
    expect(page.perforationIssues).toEqual([]);
    expect(page.slurry!.density).toBeCloseTo(15.8, 6);
    expect(page.legacyScenarioNotice).toBeNull();
    // A pasta bombeada é o tampão de 100 m em 7"; os 3 bbl dos blocos de injeção saem dele
    // (SPEC squeeze-tampao §2.1).
    const casing = BBL_M * 6.276 ** 2;
    expect(page.geom!.slurryTotal).toBeCloseTo(100 * casing, 6);
    expect(page.geom!.slurryPhysicalVolumeBbl).toBeCloseTo(100 * casing - 3, 6);
    expect(page.programVolumes!.slurry).toBeCloseTo(100 * casing, 6);
    expect(page.simuladorVolumeBbl).toBeCloseTo(100 * casing, 6);
    expect(page.pastaBombeioVolumeBbl()).toBeCloseTo(100 * casing, 6);
    const s = page.squeezeResult!.summary;
    expect(s.technique).toBe('bradenhead');
    expect(s.injectedSlurryBbl).toBeCloseTo(3, 6);
    // Sai o injetado do tampão: o topo desce de 1780 m para 1780 + 3 / Ccasing.
    expect(s.cementTopAfterSqueezeMD!).toBeCloseTo(1780 + 3 / casing, 1);
    expect(s.toolMD!).toBeLessThan(s.cementTopBeforeSqueezeMD!);
    expect(s.highPressure).toBe(false);
    expect(s.lowPressureLimitPsi!).toBeGreaterThan(1200);
    expect(page.engineDiagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(page.compressionRows()).toHaveLength(6);
    expect(page.form.getRawValue().volMaxInjetadoBbl).toBeCloseTo(3, 9);
    // Canhoneado de 10 m entre dois pontos da malha do envelope (a cada 31,3 m): os limites
    // da janela entram na malha, e poro e fratura aparecem ali, com a ECD da compressão à parte.
    const envelope = page.operationCharts!.envelope;
    for (const md of [1850, 1860]) {
      const point = envelope.find(p => Math.abs(p.md - md) < 1e-9)!;
      expect(point.fracturePpg).toBeCloseTo(15.5, 9);
      expect(point.porePpg).toBeCloseTo(8.5, 9);
      expect(point.compressionEcdPpg!).toBeGreaterThan(12.5);
      expect(point.maxEcdPpg!).toBeLessThan(10);
    }
    // Atrás do revestimento cimentado não há janela.
    expect(envelope.filter(p => p.md < 1849).every(p => p.fracturePpg === null)).toBe(true);
    const positioning = page.squeezeResult!.positioning.hydraulics!.envelope;
    expect(positioning.find(p => p.md === 1850)!.fracturePsi).toBeCloseTo(0.1706036745 * 15.5 * 1850, 1);

    // Os volumes de frente, pasta e água atrás são os da geometria da tela, e o deslocamento
    // também: ela equilibra a pasta inteira bombeada (o tampão), como o motor (§6.3).
    const g = page.geom!;
    expect(page.programVolumes!.front).toBe(g.frontPhysicalVolumeBbl);
    expect(page.programVolumes!.back).toBe(g.backPhysicalVolumeBbl);
    expect(page.programVolumes!.displacement).toBeCloseTo(g.operationalDisplacementVolumeBbl, 6);
    expect(g.topCementAfterInjectionMD).toBeCloseTo(1780 + 3 / casing, 6);
    // Sem coluna e antes da injeção, o tampão inteiro enche o intervalo.
    expect(g.topCementAfterPullMD).toBeCloseTo(1780, 6);
    expect(g.topCementAfterPullMD).toBeCloseTo(s.cementTopBeforeSqueezeMD!, 6);

    const payload = saved(page);
    const reopened = open(SimuladorSqueezeComponent);
    reopened.onCarregarEstado(scenarioForm({ formValue: payload.formValue }));
    expect(reopened.compressionBlocks()).toEqual(page.compressionBlocks());
    expect(reopened.squeezeResult!.summary.cementTopAfterSqueezeMD).toBeCloseTo(s.cementTopAfterSqueezeMD!, 9);
    expect(reopened.hydraulicSim!.summary.bhpMaxPsi).toBeCloseTo(page.hydraulicSim!.summary.bhpMaxPsi, 9);
    expect(reopened.dadosRelatorio.poco).toBe('EX-SQUEEZE-01');
    dumps['squeeze'] = { nome: SQUEEZE_EXAMPLE.nome, operacao: 'squeeze', formValue: payload.formValue };
  });

  it('squeeze: injetar o bombeado inteiro ou mais bloqueia o cálculo (SPEC squeeze-tampao §2.1)', () => {
    const page = open(SimuladorSqueezeComponent);
    load(page, SQUEEZE_EXAMPLE);
    expect(page.form.getRawValue().volMaxInjetadoBbl).toBeCloseTo(3, 9);
    page.cementVolumeSource = 'receita';
    page.manualVolumeBbl = 3;
    page.simulate();
    expect(page.operationIssues.map(i => i.code)).toEqual(['SQUEEZE_INJECTION_EXCEEDS_SLURRY']);
    expect(page.geom).toBeNull();
    expect(page.squeezeResult).toBeNull();
    // Com 1 bbl a mais, sobra cimento no poço e o cálculo volta.
    page.manualVolumeBbl = 4;
    page.simulate();
    expect(page.operationIssues).toEqual([]);
    expect(page.schematicGeom!.slurryPhysicalVolumeBbl).toBeCloseTo(1, 9);
    expect(page.squeezeResult).not.toBeNull();
  });

  it('grava os dois cenários no formato do banco quando pedido', async () => {
    const target = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['SQUEEZE_TAMPAO_DUMP'];
    expect(Object.keys(dumps).sort()).toEqual(['squeeze', 'tampao']);
    if (!target) return;
    // Sem tipos do Node no projeto: o especificador em variável passa pela checagem.
    const fsModule = 'node:fs';
    const { writeFileSync } = await import(/* @vite-ignore */ fsModule) as { writeFileSync: (path: string, data: string) => void };
    for (const [id, row] of Object.entries(dumps)) writeFileSync(target.replace(/\.json$/, `-${id}.json`), JSON.stringify(row));
  });
});
