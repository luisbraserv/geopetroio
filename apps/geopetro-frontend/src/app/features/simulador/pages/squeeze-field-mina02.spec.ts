import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BBL_M } from '../models/constantes';
import { scenarioForm, scenarioPayload } from '../models/poco.model';
import { MINA02_PROGRAM } from './primary-field-mina02.fixture';
import { SimuladorSqueezeComponent } from './simulador-squeeze/simulador-squeeze.component';
import { MINA02_SQUEEZE, MINA02_SQUEEZE_INJECT_BBL, MINA02_SQUEEZE_INTERVAL } from './squeeze-field-mina02.fixture';

/**
 * Squeeze de teste no 9⅝" do MINA-02 (packer, canhoneados de 430 a 432 m): carregado na
 * página como um cenário salvo, conferido e reaberto pelo formato do banco. Com
 * `SQUEEZE_DUMP_MINA02` apontando um arquivo, grava a linha de `simulador_cenarios`.
 */
function open(): SimuladorSqueezeComponent {
  TestBed.resetTestingModule();
  localStorage.clear();
  TestBed.configureTestingModule({ providers: [SimuladorSqueezeComponent,
    { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } }] });
  const page = TestBed.inject(SimuladorSqueezeComponent);
  page.ngOnInit();
  return page;
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('caso de teste MINA-02: squeeze com packer no 9⅝"', () => {
  it('posiciona, retira acima do cimento, comprime 5 bbl dentro da janela e reabre igual', async () => {
    const page = open();
    page.onCarregarEstado({ ...page.form.getRawValue(), ...MINA02_SQUEEZE.form,
      _dadosRelatorio: { ...page.dadosRelatorio, ...MINA02_SQUEEZE.dadosRelatorio } });
    expect(page.wellIssues).toEqual([]);
    expect(page.operationIssues).toEqual([]);
    expect(page.perforationIssues).toEqual([]);
    expect(page.engineDiagnostics).toEqual([]);
    expect(page.legacyScenarioNotice).toBeNull();
    expect(page.slurry!.density).toBeCloseTo(15.6, 6);

    // Survey do programa: 494,11 m TVD na sapata.
    const surface = page.wellGeometry!.phases.find(p => p.id === 'surface')!;
    expect(Math.abs(surface.shoe!.tvd - MINA02_PROGRAM.shoeTVD)).toBeLessThan(0.05);

    // Pasta = intervalo de 40 m no 9⅝" + os 5 bbl dos blocos de injeção.
    const casing = BBL_M * 8.921 ** 2;
    const interval = MINA02_SQUEEZE_INTERVAL.base - MINA02_SQUEEZE_INTERVAL.top;
    expect(page.geom!.slurryPhysicalVolumeBbl).toBeCloseTo(interval * casing, 6);
    expect(page.programVolumes!.slurry).toBeCloseTo(interval * casing + MINA02_SQUEEZE_INJECT_BBL, 6);
    expect(page.form.getRawValue().volMaxInjetadoBbl).toBeCloseTo(MINA02_SQUEEZE_INJECT_BBL, 9);
    expect(page.compressionRows()).toHaveLength(6);

    const s = page.squeezeResult!.summary;
    expect(s.technique).toBe('packer');
    expect(s.injectedSlurryBbl).toBeCloseTo(MINA02_SQUEEZE_INJECT_BBL, 6);
    expect(s.fluidAheadBbl).toBeCloseTo(0, 6);
    // Sai o injetado; fica a pasta do intervalo, com o topo no alvo.
    expect(s.cementTopAfterSqueezeMD!).toBeCloseTo(MINA02_SQUEEZE_INTERVAL.top, 1);
    // O packer fica acima do topo do cimento depois da retirada.
    expect(s.toolMD!).toBeLessThan(s.cementTopBeforeSqueezeMD!);
    // Compressão de baixa pressão: 300 psi na superfície, abaixo do limite.
    expect(s.highPressure).toBe(false);
    expect(s.lowPressureLimitPsi!).toBeGreaterThan(300);
    expect(s.maxToolDifferentialPsi!).toBeLessThan(5000);
    const hyd = page.hydraulicSim!.summary;
    expect(hyd.alert).toBe('inside-window');
    expect(hyd.marginToFracturePsi).toBeGreaterThan(0);
    // Fratura nos canhoneados pela rampa do programa (13,5 ppg a 300 m, 16 ppg na sapata).
    expect(hyd.fracturePsi / (0.0519480519 * 3.28084 * hyd.referenceTVD)).toBeCloseTo(15.2, 1);

    let value: Record<string, unknown> = {};
    (page as unknown as { stateModal: unknown }).stateModal = { setCurrentForm: (v: Record<string, unknown>) => { value = v; } };
    page.openStateModal();
    const payload = scenarioPayload(value);
    const reopened = open();
    reopened.onCarregarEstado(scenarioForm({ formValue: payload.formValue }));
    expect(reopened.compressionBlocks()).toEqual(page.compressionBlocks());
    expect(reopened.form.getRawValue().trajectory).toEqual(page.form.getRawValue().trajectory);
    expect(reopened.squeezeResult!.summary).toEqual(s);
    expect(reopened.hydraulicSim!.summary.bhpMaxPsi).toBeCloseTo(hyd.bhpMaxPsi, 9);
    expect(reopened.dadosRelatorio.poco).toBe('MINA-02');

    const target = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['SQUEEZE_DUMP_MINA02'];
    if (!target) return;
    // Sem tipos do Node no projeto: o especificador em variável passa pela checagem.
    const fsModule = 'node:fs';
    const { writeFileSync } = await import(/* @vite-ignore */ fsModule) as { writeFileSync: (path: string, data: string) => void };
    writeFileSync(target, JSON.stringify({ nome: MINA02_SQUEEZE.nome, operacao: 'squeeze', formValue: payload.formValue }));
  });
});
