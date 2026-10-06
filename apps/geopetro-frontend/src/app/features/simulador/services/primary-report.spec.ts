import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SimuladorPrimariaComponent } from '../pages/simulador-primaria/simulador-primaria.component';
import { renderPrimaryReportHtml } from './primary-report-html';

afterEach(() => TestBed.resetTestingModule());

function create() {
  const fixture = TestBed.createComponent(SimuladorPrimariaComponent);
  fixture.componentInstance.selectOperationPhase('open');
  fixture.detectChanges();
  return fixture.componentInstance;
}

const section = (component: ReturnType<typeof create>, id: string) =>
  component.report().sections.find(entry => entry.id === id)!;

describe('primary cementing report (P11)', () => {
  it('carries every section of the spec', () => {
    const component = create();
    expect(component.report().sections.map(entry => entry.id)).toEqual([
      'identificacao', 'geometria', 'survey', 'caliper', 'dispositivos', 'fluidos', 'volumes', 'programa',
      'receita-stage-1-cement-1', 'sequencia-operacional', 'resultados', 'balanco', 'hidraulica', 'medicoes', 'convencoes', 'observacoes']);
  });

  it('documents optional survey and caliper even when they were not supplied', () => {
    const component = create();
    expect(section(component, 'survey').notes!.join(' ')).toContain('Survey não informado');
    expect(section(component, 'caliper').notes!.join(' ')).toContain('Caliper não importado');
  });

  it('allows report visuals to target the whole well or one phase', () => {
    const component = create();
    expect(component.reportVisualPhaseOptions().some(option => option.id === 'all')).toBe(true);
    expect(component.reportVisualPhaseOptions().some(option => option.id === 'open')).toBe(true);
    component.setReportVisualPhase('open');
    const ids = component.reportVisualCatalog().map(visual => visual.id);
    expect(ids.filter(id => ['profile-open', 'plan-open', 'caliper-open'].includes(id))).toHaveLength(2);
    expect(ids).toContain('pressure-envelope-open');
    expect(ids).toContain('hydrostatic-ecd');
    expect(ids).toContain('injected-volume-time');
  });

  it('reports the base case as partial because the model was interrupted', () => {
    const component = create();
    const report = component.report();
    // A pasta pesada entra em queda livre: o relatório não conclui sobre tudo.
    expect(report.status).toBe('partial');
    expect(report.conclusion).toContain('não conclui');
    expect(report.conclusion).not.toContain('aprovação');
  });

  it('still lists every chart, all marked as not rebuilt after the redesign', () => {
    const component = create();
    const charts = component.report().charts;
    expect(charts.filter(chart => chart.family === 'herdado')).toHaveLength(8);
    expect(charts.filter(chart => chart.family === 'anexo')).toHaveLength(5);
    expect(charts.filter(chart => chart.family === 'complemento')).toHaveLength(2);
    // O catálogo diz o que existirá; nenhum gráfico some do relatório.
    for (const chart of charts) {
      expect(chart.axes).toBeTruthy();
      expect(chart.available).toBe(false);
      expect(chart.unavailableReason).toContain('não reconstruído na tela');
    }
  });

  it('still says the measured section has nothing imported', () => {
    const component = create();
    expect(section(component, 'medicoes').notes!.join(' ')).toContain('indisponíveis');
  });

  it('records the measured alignment and the original units once imported', () => {
    const component = create();
    component.loadCsvText('tempo,retorno\n0,3\n5,4\n');
    component.timeColumn.set('tempo');
    component.setChannelColumn('return-rate', 'retorno');
    component.channelUnit.update(current => ({ ...current, 'return-rate': 'L/min' }));
    component.importOffsetMin.set(5);
    component.importDataset();
    const row = section(component, 'medicoes').table!.rows[0];
    expect(row.join(' | ')).toContain('L/min → bpm');
    expect(row.join(' | ')).toContain('5.00');
  });

  it('includes the end of each stage and the instants the user marked', () => {
    const component = create();
    expect(component.report().snapshots.map(entry => entry.reason)).toEqual(['fim-de-estagio']);
    component.onCursor('1.5');
    component.marcarSnapshot();
    const snapshots = component.report().snapshots;
    expect(snapshots.some(entry => entry.reason === 'escolhido')).toBe(true);
    // Ordenados por tempo, sem duplicar o fim de estágio já incluído.
    expect(snapshots.map(entry => entry.timeMin)).toEqual([...snapshots.map(e => e.timeMin)].sort((a, b) => a - b));
    component.limparSnapshots();
    expect(component.report().snapshots.every(entry => entry.reason === 'fim-de-estagio')).toBe(true);
  });

  it('separates the pumped volume from the prepared material', () => {
    const component = create();
    component.setMixingReserve(0, 0, '12');
    const headers = section(component, 'volumes').table!.headers;
    expect(headers).toContain('Reserva de mistura (bbl)');
    expect(headers).toContain('Preparado (bbl)');
    const row = section(component, 'volumes').table!.rows[0];
    expect(row[headers.indexOf('Reserva de mistura (bbl)')]).toBe('12.00');
    expect(section(component, 'volumes').notes!.join(' ')).toContain('não entra no volume bombeado');
  });

  it('names the friction correlation and its nominal limits', () => {
    const component = create();
    const value = section(component, 'convencoes').rows!
      .find(row => row.label === 'Correlação de atrito')!.value;
    expect(value).toContain('r3-guillot-4-6');
    expect(value).toContain('3250 − 1150n');
    expect(value).toContain('4150 − 1150n');
    const freeFall = section(component, 'convencoes').rows!.find(row => row.label === 'Queda livre')!.value;
    expect(freeFall).toContain('vazio');
  });

  it('shows the origin of each fluid property and warns about the lab curves', () => {
    const component = create();
    component.setFluidDensity('cement', '16.2');
    const fluids = section(component, 'fluidos');
    const headers = fluids.table!.headers;
    const row = fluids.table!.rows.find(entry => entry[0] === 'Pasta')!;
    expect(row[headers.indexOf('Origem da densidade')]).toBe('entered');
    expect(fluids.notes!.join(' ')).toContain('não são ensaio de laboratório');
  });

  it('keeps the volume balance with the residual per fluid', () => {
    const component = create();
    const balance = section(component, 'balanco');
    expect(balance.table!.headers).toContain('Residual (bbl)');
    expect(balance.table!.rows.length).toBeGreaterThan(0);
    expect(balance.notes!.join(' ')).toContain('perda é zero nesta versão');
  });

  it('renders printable HTML that states availability as text, not only colour', () => {
    const component = create();
    const html = renderPrimaryReportHtml(component.report());
    expect(html).toContain('RESULTADO PARCIAL');
    expect(html).toContain('indisponível —');
    expect(html).toContain('não reconstruído na tela');
    expect(html).toContain('@page');
    expect(html).toContain('@media print');
  });

  it('writes the operational sequence as numbered steps, like the squeeze and plug reports', () => {
    const component = create();
    const items = section(component, 'sequencia-operacional').sequence!;
    // Estágio, preparo com a receita embutida, pasta, plugue e deslocamento, com os valores em destaque.
    expect(items[0].kind).toBe('stage');
    const preparation = items.find(item => item.table)!;
    expect(preparation.parts.find(part => part.strong)!.text).toMatch(/bbl$/);
    expect(preparation.table!.headers).toEqual(['Produto', 'Código / origem', 'Concentração', 'Quantidade']);
    expect(items.some(item => item.parts.some(part => part.text === 'Lançar plugue superior' && part.strong))).toBe(true);
    const html = renderPrimaryReportHtml(component.report());
    expect(html).toContain('<ol class="sequence-list">');
    expect(html).toContain('class="sequence-table"');
    expect(html).toMatch(/<strong>\d[\d.,]* bbl<\/strong>/);
    // Capítulos numerados e subseções N.M, sem a tabela "Etapa | Descrição".
    expect(html).toContain('<span class="num">4.</span><h1>Sequência operacional</h1>');
    expect(html).toContain('<span class="num">2.1</span><h2>Geometria e revestimento-alvo</h2>');
    expect(html).not.toContain('<th>Etapa</th>');
  });

  it('escapes text so a scenario name cannot inject markup', () => {
    const component = create();
    component.scenarioName.set('<script>alert(1)</script>');
    const html = renderPrimaryReportHtml(component.report());
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('ties the report to the revision it was generated from', () => {
    const component = create();
    const revision = component.report().revision;
    expect(revision.scenarioName).toBe(component.scenarioName());
    expect(revision.schemaVersion).toBe(2);
    expect(revision.engineVersion).toBeNull();
    expect(revision.inputsMatchResults).toBe(true);
    expect(revision.savedAt).toBeNull();
  });
});
