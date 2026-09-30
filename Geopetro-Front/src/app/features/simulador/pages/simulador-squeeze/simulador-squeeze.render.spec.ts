import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelatorioBuilderService } from '../../components/relatorio/relatorio-builder.service';
import type { RelatorioCapaData } from '../../components/relatorio/relatorio-capa-modal.component';
import { ConformidadeOperacionalReportService } from '../../services/conformidade-operacional-report.service';
import { SimuladorSqueezeComponent } from './simulador-squeeze.component';

/**
 * Squeeze na tela nova (SPEC squeeze-tampao S7, casos T-17, T-18 e T-20): técnica e blocos
 * de compressão, os três gráficos da primária com o seletor de referência, perfil e planta
 * sem caliper, cronograma e UCA em tabela e o relatório em SVG.
 */
let fixture: ComponentFixture<SimuladorSqueezeComponent>;
let page: SimuladorSqueezeComponent;
const root = () => fixture.nativeElement as HTMLElement;
const text = () => root().textContent ?? '';
/** Troca de aba pelo botão, como na tela: sem zona, só o evento marca a view para verificação. */
function open(tab: Parameters<SimuladorSqueezeComponent['setTab']>[0]): void {
  const index = page.tabs.findIndex(entry => entry.id === tab);
  root().querySelectorAll<HTMLButtonElement>('.sim-tab')[index].click();
  fixture.detectChanges();
  expect(page.activeTab).toBe(tab);
}
const decode = (url: string) => decodeURIComponent(url.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));

/** O jsdom não tem canvas nem ResizeObserver; os esquemáticos próprios (que continuam) usam os dois. */
function stubBrowser(): void {
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, prop) => prop in target ? target[prop]
      : prop === 'measureText' ? () => ({ width: 0 })
      : prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern'
        ? () => ({ addColorStop: () => undefined }) : () => undefined,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
}

beforeEach(async () => {
  localStorage.clear();
  stubBrowser();
  await TestBed.configureTestingModule({ imports: [SimuladorSqueezeComponent] }).compileComponents();
  fixture = TestBed.createComponent(SimuladorSqueezeComponent);
  page = fixture.componentInstance;
  fixture.detectChanges();
  page.selectOperationPhase('phase-2');
  fixture.detectChanges();
});

afterEach(() => {
  fixture?.destroy();
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('squeeze na tela nova', () => {
  it('mostra os três gráficos com o seletor entre canhoneados e extremidade da coluna', () => {
    open('simulations');
    expect(page.squeezeResult).not.toBeNull();
    for (const chart of ['hydro-ecd', 'envelope', 'volume-time'])
      expect(root().querySelector(`[data-chart="${chart}"]`)).not.toBeNull();
    expect(root().querySelector('app-squeeze-operation-charts')).toBeNull();
    const select = root().querySelector<HTMLSelectElement>('[data-reference-select]')!;
    expect([...select.options].map(o => o.textContent?.trim())).toEqual(['Canhoneados', 'Extremidade da coluna']);
    expect(text()).toContain('ECD e pressão hidrostática nos canhoneados');
    expect(root().querySelector('[data-card="compressao"]')).not.toBeNull();
    expect(root().querySelectorAll('table[data-table="compressao"] tbody tr').length).toBe(page.compressionBlocks().length);
    expect(page.operationCharts!.volumes.some(s => s.label === 'Injetado na formação')).toBe(true);
  });

  it('troca a técnica: packer mostra a contrapressão; retentor, a profundidade da ferramenta', () => {
    page.secInjecaoOpen = true;
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(root().querySelector('[formControlName="contrapressaoAnularPsi"]')).toBeNull();
    page.form.patchValue({ tecnicaSqueeze: 'packer' });
    page.simulate();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(root().querySelector('[formControlName="contrapressaoAnularPsi"]')).not.toBeNull();
    expect(page.squeezeResult!.summary.technique).toBe('packer');
    page.form.patchValue({ tecnicaSqueeze: 'retainer' });
    page.simulate();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(root().querySelector('[formControlName="retentorMD"]')).not.toBeNull();
    // Padrão: 10 m acima do canhoneado de topo (1420 m).
    expect(page.squeezeResult!.summary.toolMD).toBe(1410);
    expect(page.squeezeResult!.summary.injectedSlurryBbl).toBeCloseTo(2, 1);
  });

  it('os blocos de compressão alimentam os campos de hoje do dimensionamento e do relatório', () => {
    page.addBloco('inject');
    page.simulate();
    const blocks = page.compressionBlocks();
    expect(blocks).toHaveLength(3);
    const injected = blocks.reduce((s, b) => s + (b.kind === 'inject' ? b.volumeBbl : 0), 0);
    expect(page.form.getRawValue().volMaxInjetadoBbl).toBeCloseTo(injected, 9);
    expect(page.geom!.expectedLoss).toBeCloseTo(injected, 9);
  });

  it('não tem aba de reologia nem leituras Fann: a pasta usa a reologia estimada pelos aditivos', () => {
    expect(page.tabs.map(tab => tab.label).join(' ')).not.toContain('Reologia');
    expect(root().querySelector('[formcontrolname^="theta"]')).toBeNull();
    expect(Object.keys(page.form.controls).some(key => key.startsWith('theta'))).toBe(false);
    expect(page.rheologyResult!.source).not.toBe('theta');
    expect(page.tt).not.toBeNull();
    // Atrito e ECD como na primária: sem aviso de reologia, sem standoff.
    expect(page.operationCharts!.rheologyWarning).toBeNull();
    expect(Object.keys(page.form.controls)).toEqual(expect.arrayContaining(['internalFrictionLevel', 'annularFrictionLevel']));
    expect(Object.keys(page.form.controls)).not.toContain('standoffPct');
  });

  it('traz o cronograma com a compressão e os marcos de UCA em tabela, sem os gráficos antigos', () => {
    expect(root().querySelector('app-ops-chart')).toBeNull();
    expect(page.cronograma.map(r => r.label).some(label => label.startsWith('Injeção'))).toBe(true);
    expect(root().querySelectorAll('table[data-table="cronograma"] tbody tr').length).toBe(page.cronograma.length);
    open('recipe');
    expect(root().querySelector('app-thickening-chart')).toBeNull();
    expect(root().querySelector('app-uca-chart')).toBeNull();
    expect(root().querySelectorAll('table[data-table="uca"] tbody tr').length).toBe(4);
    expect(text()).not.toContain('Fator hidráulico');
  });

  it('desenha perfil e planta sem caliper', () => {
    open('schematic');
    expect(root().querySelector('app-primary-well-2d')).not.toBeNull();
    expect(page.well2dViews.every(view => !view.model.showCaliper)).toBe(true);
    expect(root().querySelector('app-primary-well-2d')!.textContent ?? '').not.toContain('Caliper');
  });
});

describe('relatório e cenários do squeeze (T-17, T-18 e T-20)', () => {
  it('T-17: gera premissas, compressão, os três gráficos, perfil e planta em SVG, sem caliper', async () => {
    const images: { label: string; imagem: string }[] = await (page as any).captureGraficosImages(['cronograma', 'pressao']);
    const labels = images.map(image => image.label);
    expect(labels.slice(0, 4)).toEqual(['Cronograma operacional', 'Resistência à compressão (UCA)',
      'Premissas da simulação', 'Técnica e compressão']);
    expect(labels).toContain('Pressao hidrostatica (ESD) e ECD');
    expect(labels).toContain('Volume injetado x tempo');
    for (const image of images) {
      expect(image.imagem.startsWith('data:image/svg+xml')).toBe(true);
      expect(decode(image.imagem).toLowerCase()).not.toContain('caliper');
    }
    const compression = decode(images[3].imagem);
    expect(compression).toContain('Bradenhead');
    expect(compression).toContain('Limite');
    expect(decode(images[2].imagem)).toContain('reboco');
  });

  it('relatório gráfico a gráfico: só os escolhidos, na ordem do catálogo, com o risco de fratura', async () => {
    const images: { label: string; imagem: string }[] = await (page as any).captureGraficosImages(['fracture-risk', 'premissas']);
    expect(images.map(image => image.label)).toEqual(['Premissas da simulação', 'Risco de fratura nos canhoneados']);
    expect(decode(images[1].imagem)).toContain('Janela operacional');
    expect(page.reportChartOptions.map(option => option.id)).toContain('fracture-risk');
  });

  it('mostra a maior pressão de superfície sem fraturar e leva os blocos até ela', () => {
    page.secInjecaoOpen = true;
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const limit = page.pressaoMaxSemFraturarPsi!;
    expect(limit).toBeCloseTo(page.squeezeResult!.summary.lowPressureLimitPsi!, 9);
    expect(root().querySelector('[data-hint="pressao-sem-fraturar"]')?.textContent).toContain('sem fraturar');
    // Os blocos são cartões com rótulo: a pressão de cada um aparece inteira.
    expect(root().querySelectorAll('[data-table="blocos"] .block-card')).toHaveLength(page.compressionBlocks().length);
    page.aplicarPressaoSemFraturar();
    expect(page.compressionBlocks().every(block => block.surfacePressurePsi === Math.floor(limit / 50) * 50)).toBe(true);
  });

  it('pressão máxima de injeção num campo só: os blocos no máximo acompanham, degraus menores ficam', () => {
    page.secInjecaoOpen = true;
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const field = root().querySelector<HTMLInputElement>('[data-field="pressao-max-injecao"]')!;
    expect(Number(field.value)).toBe(page.pressaoMaxInjecaoPsi);
    // O programa do poço: 1500 psi.
    field.value = '1500';
    field.dispatchEvent(new Event('change'));
    expect(page.compressionBlocks().map(block => block.surfacePressurePsi)).toEqual([1500, 1500]);
    // Hesitação: 1000 e 1500 psi; o máximo sobe e desce sem mexer no degrau de baixo.
    page.blocosCompressao.at(0).patchValue({ pressaoPsi: 1000 });
    page.setPressaoMaxInjecao(1800);
    expect(page.compressionBlocks().map(block => block.surfacePressurePsi)).toEqual([1000, 1800]);
    page.setPressaoMaxInjecao(900);
    expect(page.compressionBlocks().map(block => block.surfacePressurePsi)).toEqual([900, 900]);
    // Acima do teto sem fraturar, o aviso fica vermelho.
    page.setPressaoMaxInjecao(Math.ceil(page.pressaoMaxSemFraturarPsi! + 500));
    page.simulate();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(root().querySelector('[data-hint="pressao-sem-fraturar"]')!.classList.contains('hint-alerta')).toBe(true);
  });

  it('T-20 e T-18: cenário antigo abre como Bradenhead com a injeção de hoje, avisa e não grava nada', async () => {
    const saved = page.form.getRawValue() as Record<string, unknown>;
    const { tecnicaSqueeze: _t, blocosCompressao: _b, retentorMD: _r, retentorFundoMD: _f, contrapressaoAnularPsi: _c,
      diferencialFerramentaPsi: _d, rupturaRevestimentoPsi: _p, headCondition: _h, ...old } = saved;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    page.onCarregarEstado({ ...old, volMaxInjetadoBbl: 3, pressaoOperacao: 1800, tempoPressurizacaoMin: 12,
      _dadosRelatorio: { ...page.dadosRelatorio, graficosOperacionaisSelecionados: ['pressao', 'cronograma'] } });
    expect(page.technique).toBe('bradenhead');
    expect(page.compressionBlocks()).toEqual([{ kind: 'inject', volumeBbl: 3, rateBpm: 0.25, surfacePressurePsi: 1800 }]);
    expect(page.legacyScenarioNotice).toContain('Bradenhead');
    expect(setItem.mock.calls.every(([key]) => !String(key).toLowerCase().includes('cenario'))).toBe(true);
    page.openCapaModal();
    expect((page.relatorioPrefill as Partial<RelatorioCapaData>).graficosOperacionaisSelecionados).toEqual(['pressao', 'cronograma']);
    const builder = TestBed.inject(RelatorioBuilderService);
    const buildCapa = vi.spyOn(builder, 'buildCapa').mockReturnValue('<html></html>');
    vi.spyOn(builder, 'openInNewTab').mockImplementation(() => {});
    page.onCapaGerada({ ...(page.relatorioPrefill as RelatorioCapaData) });
    await new Promise(resolve => setTimeout(resolve));
    const labels = buildCapa.mock.calls[0][0].graficosOperacionaisImages!.map(image => image.label);
    expect(labels).toContain('Cronograma operacional');
    expect(labels).toContain('Técnica e compressão');
    // Um cenário salvo depois das técnicas mantém os blocos e não mostra o aviso.
    page.onCarregarEstado({ ...page.form.getRawValue() });
    expect(page.legacyScenarioNotice).toBeNull();
    expect(page.compressionBlocks()).toEqual([{ kind: 'inject', volumeBbl: 3, rateBpm: 0.25, surfacePressurePsi: 1800 }]);
  });

  it('o relatório de conformidade lê o motor novo, com a injeção nos canhoneados', () => {
    const report = TestBed.inject(ConformidadeOperacionalReportService);
    const abrir = vi.spyOn(report, 'abrir').mockImplementation(() => {});
    page.gerarRelatorioConformidade('injetividade');
    const params = abrir.mock.calls[0][0];
    expect(params.motor).toBe('primaria');
    expect(params.sim.points.some(p => /Inje/.test(p.phase))).toBe(true);
    expect(params.v.volMaxInjetadoBbl).toBeCloseTo(2, 9);
    expect(params.predictTopMD!(1)).toBeCloseTo(page.squeezeResult!.summary.cementTopBeforeSqueezeMD!, 6);
  });
});
