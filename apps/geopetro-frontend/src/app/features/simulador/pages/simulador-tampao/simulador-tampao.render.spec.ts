import { PRIMARY_REFERENCE_RHEOLOGY_SOURCE, primaryDefaultRheology } from '../../models/primary-default-rheology';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationChartsComponent } from '../../components/charts/operation-charts.component';
import { RelatorioBuilderService } from '../../components/relatorio/relatorio-builder.service';
import type { RelatorioCapaData } from '../../components/relatorio/relatorio-capa-modal.component';
import { ConformidadeOperacionalReportService } from '../../services/conformidade-operacional-report.service';
import { SimuladorTampaoComponent } from './simulador-tampao.component';

/**
 * Tampão na tela nova (SPEC squeeze-tampao S4, casos T-09, T-17 e T-18): os três
 * gráficos da primária, perfil e planta sem caliper, cronograma e UCA em tabela, e o
 * relatório em SVG. jsdom não avalia layout; o que se confere é o conteúdo no DOM.
 */
let fixture: ComponentFixture<SimuladorTampaoComponent>;
let page: SimuladorTampaoComponent;
const root = () => fixture.nativeElement as HTMLElement;
const text = () => root().textContent ?? '';
/** Troca de aba pelo botão, como na tela: sem zona, só o evento marca a view para verificação. */
function open(tab: Parameters<SimuladorTampaoComponent['setTab']>[0]): void {
  const index = page.tabs.findIndex(entry => entry.id === tab);
  root().querySelectorAll<HTMLButtonElement>('.sim-tab')[index].click();
  fixture.detectChanges();
  expect(page.activeTab).toBe(tab);
}
const decode = (url: string) => decodeURIComponent(url.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));

/** O jsdom não tem canvas; os esquemáticos antigos (que continuam) desenham nele. */
function stubCanvas(): void {
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, prop) => prop in target ? target[prop]
      : prop === 'measureText' ? () => ({ width: 0 })
      : prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern'
        ? () => ({ addColorStop: () => undefined }) : () => undefined,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  // Nem ResizeObserver, que os esquemáticos usam para redesenhar.
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
}

beforeEach(async () => {
  localStorage.clear();
  stubCanvas();
  // Template e estilo em arquivos: a página precisa ser compilada antes.
  await TestBed.configureTestingModule({ imports: [SimuladorTampaoComponent] }).compileComponents();
  fixture = TestBed.createComponent(SimuladorTampaoComponent);
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

describe('tampão na tela nova (T-09)', () => {
  it('mostra os três gráficos da primária na base do tampão, com a fase da operação no envelope', () => {
    open('pressure');
    expect(page.tampaoResult).not.toBeNull();
    for (const chart of ['hydro-ecd', 'envelope', 'volume-time'])
      expect(root().querySelector(`[data-chart="${chart}"]`)).not.toBeNull();
    expect(root().querySelector('app-squeeze-operation-charts')).toBeNull();
    expect(root().querySelector('app-pressure-chart')).toBeNull();
    // Uma referência só: sem seletor.
    expect(root().querySelector('[data-reference-select]')).toBeNull();
    expect(text()).toContain('ECD e pressão hidrostática na base do tampão');
    const charts = fixture.debugElement.query(By.directive(OperationChartsComponent)).componentInstance as OperationChartsComponent;
    expect(charts.selectedPhaseId).toBe('phase-2');
    expect(page.operationCharts!.envelopeMarker!.label).toBe('Topo da fase da operação');
    // Resumo do equilíbrio e da retirada, pelo motor.
    expect(root().querySelector('[data-card="equilibrio"]')).not.toBeNull();
    expect(text()).toContain('Topo da pasta após a retirada');
    expect(page.hydraulicSim!.summary.referenceMD).toBe(page.plug!.pBase);
  });

  it('desenha perfil e planta sem caliper, com o tampão no poço cheio', () => {
    open('schematic');
    expect(root().querySelector('app-primary-well-2d')).not.toBeNull();
    expect(root().querySelector('app-schematic-tampao')).not.toBeNull();
    expect(page.well2dViews.every(view => !view.model.showCaliper)).toBe(true);
    const well2d = root().querySelector('app-primary-well-2d')!.textContent ?? '';
    expect(well2d).not.toContain('Caliper');
    expect(well2d).not.toContain('não possui amostras de caliper');
  });

  it('não tem aba de reologia nem leituras Fann: a pasta usa a reologia estimada pelos aditivos', () => {
    expect(page.tabs.map(tab => tab.label).join(' ')).not.toContain('Reologia');
    expect(root().querySelector('[formcontrolname^="theta"]')).toBeNull();
    expect(Object.keys(page.form.controls).some(key => key.startsWith('theta'))).toBe(false);
    expect(page.rheologyResult!.source).not.toBe('theta');
    expect(page.tt).not.toBeNull();
    // Atrito e ECD como na primária: a pasta com a reologia de referência (R3 §12-7) e sem aviso.
    const slurry = page.tampaoResult!.primary.fluids.find(fluid => fluid.id === 'slurry')!;
    expect(slurry.rheology).toMatchObject(primaryDefaultRheology('cement'));
    expect(slurry.propertySources.n!.reference).toBe(PRIMARY_REFERENCE_RHEOLOGY_SOURCE);
    expect(page.tampaoResult!.primary.frictionSettings).toEqual({ internal: 'medium', annular: 'medium' });
    expect(page.operationCharts!.rheologyWarning).toBeNull();
  });

  it('traz o cronograma e os marcos de UCA em tabela, sem os gráficos antigos', () => {
    open('recipe');
    expect(root().querySelector('app-ops-chart')).toBeNull();
    const rows = root().querySelectorAll('table[data-table="cronograma"] tbody tr');
    expect(rows.length).toBe(page.cronograma.length);
    expect(page.cronograma.map(row => row.label)).toEqual(['Água à frente', 'Pasta', 'Água atrás', 'Deslocamento',
      'Equilíbrio do tubo em U'].filter(label => page.cronograma.some(row => row.label === label)));
    expect(page.cronograma.at(-1)!.accumulatedMin).toBeCloseTo(
      page.cronograma.reduce((sum, row) => sum + row.durationMin, 0), 9);
    expect(text()).toContain('Margem até o TT 50 Bc');
    open('recipe');
    expect(root().querySelector('app-thickening-chart')).toBeNull();
    expect(root().querySelector('app-uca-chart')).toBeNull();
    expect(root().querySelectorAll('table[data-table="uca"] tbody tr').length).toBe(4);
    expect(text()).not.toContain('Fator hidráulico');
  });

  it('não mostra mais o teto de queda livre e oferece a condição da cabeça', () => {
    expect(root().querySelector('[formControlName="freeFallMaxFactor"]')).toBeNull();
    expect(root().querySelector('select[formControlName="headCondition"]')).not.toBeNull();
    // Padrão ventilado, como o iCem: o vazio da queda livre fica à pressão atmosférica.
    expect(page.form.value.headCondition).toBe('vented-free-surface');
    expect(page.tampaoResult!.primary.headCondition).toBe('vented-free-surface');
  });
});

describe('relatório do tampão (T-17 e T-18)', () => {
  it('gera o cronograma, os marcos de UCA, as premissas e os três gráficos em SVG, sem caliper', async () => {
    const images: { label: string; imagem: string }[] =
      await (page as any).captureGraficosImages(['cronograma', 'pressao']);
    expect(images.map(image => image.label)).toEqual(['Cronograma operacional', 'Resistência à compressão (UCA)',
      'Premissas da simulação', 'Janela operacional - ponto crítico', 'Pressao hidrostatica (ESD) e ECD', 'Envelope de pressao - Poço aberto',
      'Volume injetado x tempo', 'Perfil direcional e cimentação - Poço aberto', 'Planta da trajetória - Poço aberto']);
    for (const image of images) {
      expect(image.imagem.startsWith('data:image/svg+xml')).toBe(true);
      expect(decode(image.imagem)).toContain('<svg');
      expect(decode(image.imagem).toLowerCase()).not.toContain('caliper');
    }
    const premissas = decode(images[2].imagem);
    expect(premissas).toContain('Nao modela');
    expect(premissas).toContain('Mistura e contaminacao nas interfaces');
  });

  it('abre um cenário antigo com "pressao" e "cronograma" e gera o conteúdo novo, sem gravar nada', async () => {
    const snapshot = page.form.getRawValue();
    const dadosRelatorio = { ...page.dadosRelatorio, graficosOperacionaisSelecionados: ['pressao', 'cronograma'] };
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    page.onCarregarEstado({ ...snapshot, _dadosRelatorio: dadosRelatorio });
    // O único registro é o de sempre dos dados do relatório no navegador; nenhum cenário é salvo.
    expect(setItem.mock.calls.every(([key]) => !String(key).toLowerCase().includes('cenario'))).toBe(true);
    page.openCapaModal();
    expect((page.relatorioPrefill as Partial<RelatorioCapaData>).graficosOperacionaisSelecionados).toEqual(['pressao', 'cronograma']);
    const builder = TestBed.inject(RelatorioBuilderService);
    const buildCapa = vi.spyOn(builder, 'buildCapa').mockReturnValue('<html></html>');
    vi.spyOn(builder, 'openInNewTab').mockImplementation(() => {});
    page.onCapaGerada({ ...(page.relatorioPrefill as RelatorioCapaData) });
    await new Promise(resolve => setTimeout(resolve));
    const data = buildCapa.mock.calls[0][0];
    expect(data.graficosOperacionaisImages!.map(image => image.label)).toContain('Cronograma operacional');
    expect(data.graficosOperacionaisImages!.map(image => image.label)).toContain('Pressao hidrostatica (ESD) e ECD');
  });

  it('o relatório de conformidade lê o motor novo e simula o sub-deslocamento linha a linha', () => {
    const report = TestBed.inject(ConformidadeOperacionalReportService);
    const abrir = vi.spyOn(report, 'abrir').mockImplementation(() => {});
    page.gerarRelatorioConformidade('subdeslocamento');
    const params = abrir.mock.calls[0][0];
    expect(params.motor).toBe('primaria');
    expect(params.placement!.predictedTopMD).toBeCloseTo(page.tampaoResult!.summary.cementTopAfterPullMD!, 9);
    const top = params.predictTopMD!(0.97);
    expect(top).not.toBeNull();
    // Subdeslocado, o tubo em U drena até equilibrar: o topo depois da retirada muda pouco.
    expect(Math.abs(top! - params.placement!.predictedTopMD!)).toBeLessThan(5);
  });
});
