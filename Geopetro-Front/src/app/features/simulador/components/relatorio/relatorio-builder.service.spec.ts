import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SQUEEZE_REPORT_CHARTS } from '../../services/report-chart-selection';
import { RelatorioBuilderService } from './relatorio-builder.service';
import { RelatorioCapaModalComponent, type RelatorioCapaData } from './relatorio-capa-modal.component';

afterEach(() => TestBed.resetTestingModule());

const svg = (title: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg viewBox="0 0 720 460"><text>${title}</text></svg>`)}`;
function data(over: Partial<RelatorioCapaData> = {}): RelatorioCapaData {
  return {
    cliente: 'Cliente', preparadoPara: 'ORIGEM', documento: 'Programa', preparadoPor: 'Autor', revisadoPor: 'Revisor',
    data: '2026-09-25', versao: '01', origem: 'Braserv', poco: '7-PIR-259D-AL', campo: 'PILAR', sonda: 'SPT-45', jobNum: '',
    operacao: 'SQUEEZE', zonaIsolarNome: 'CSO-6E1', calculoTampaoPor: 'altura', inicioTampao: '1470', fimTampao: '1542',
    bombeioRows: [{ fluido: 'Água a frente', volumeBbl: 5.1, vazaoBpm: 2 }, { fluido: 'Pasta 15,8 ppg', volumeBbl: 11.3, vazaoBpm: 2 },
      { fluido: 'Água atrás', volumeBbl: 0.9, vazaoBpm: 2 }, { fluido: 'Deslocamento', volumeBbl: 26.6, vazaoBpm: 2 }],
    vazoesBombeio: { fluidoFrenteBpm: '', pastaBpm: '', fluidoAtrasBpm: '', deslocamentoBpm: '' },
    sequenciaOperacional: {} as RelatorioCapaData['sequenciaOperacional'],
    graficosOperacionaisImages: [{ label: 'ECD e pressao hidrostatica', imagem: svg('ECD') },
      { label: 'Envelope de pressao', imagem: svg('Envelope') }, { label: 'Risco de fratura nos canhoneados', imagem: svg('Fratura') }],
    ...over,
  };
}
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('relatório do squeeze e do tampão: tópicos corridos e gráficos em "Simulação"', () => {
  it('sumário só com os tópicos, sem capa, ficha nem um item por gráfico', () => {
    const doc = parse(TestBed.inject(RelatorioBuilderService).buildCapa(data({
      secoesPersonalizadas: [{ titulo: 'Anexo de campo', texto: 'Observações', imagens: [] }] })));
    const labels = [...doc.querySelectorAll('.indice-row .indice-label')].map(el => el.textContent);
    expect(labels).toEqual(['Cimentação SQUEEZE', 'Poço', 'Operação', 'Simulação', 'Sequência operacional', 'Anexo de campo']);
    // A página de cada tópico sai da paginação, no navegador: o sumário aponta para o título de cada um.
    const flow = doc.getElementById('tech-flow')!;
    for (const cell of doc.querySelectorAll<HTMLElement>('.indice-page-num'))
      expect(flow.querySelector(`[data-toc="${cell.dataset['toc']}"]`)).not.toBeNull();
    expect(doc.querySelector('#tech-page-template')).not.toBeNull();
    expect([...doc.querySelectorAll('script')].some(s => s.textContent?.includes('tech-page-template'))).toBe(true);
  });

  it('cada gráfico é uma figura dentro de "Simulação", sem título próprio, e os blocos não forçam folha nova', () => {
    const doc = parse(TestBed.inject(RelatorioBuilderService).buildCapa(data()));
    const flow = doc.getElementById('tech-flow')!;
    const simulation = [...flow.querySelectorAll<HTMLElement>('[data-topic="4. Simulação"]')];
    expect(simulation[0].dataset['toc']).toBe('simulacao');
    expect(simulation.filter(el => el.querySelector('figure img'))).toHaveLength(3);
    expect([...flow.querySelectorAll('h1')].map(h => h.textContent)).toEqual(
      ['Cimentação SQUEEZE', 'Poço', 'Operação', 'Simulação', 'Sequência operacional']);
    // Nada de folha fixa por seção: o texto técnico é uma sequência de blocos.
    expect(doc.querySelectorAll('.page.tech-page')).toHaveLength(0);
    expect(flow.querySelectorAll('.flow-block').length).toBeGreaterThan(20);
    // Título de tópico e subtítulos ficam presos ao que vem depois.
    expect([...flow.querySelectorAll<HTMLElement>('[data-toc]')].every(el => el.dataset['keep'] === 'next')).toBe(true);
  });

  it('a sequência operacional é um bloco por passo, numerado em ordem', () => {
    const doc = parse(TestBed.inject(RelatorioBuilderService).buildCapa(data({ graficosOperacionaisImages: [] })));
    const starts = [...doc.querySelectorAll('ol.sequence-list')].map(ol => Number(ol.getAttribute('start')));
    expect(starts).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    // Sem gráficos, sem o tópico "Simulação"; a sequência vira o 4.
    const flow = doc.getElementById('tech-flow')!;
    expect(flow.querySelector('[data-toc="simulacao"]')).toBeNull();
    expect(flow.querySelector('[data-toc="sequencia"]')?.getAttribute('data-topic')).toBe('4. Sequência operacional');
  });
});

describe('capa do relatório: um checkbox por gráfico', () => {
  it('abre a seleção antiga por grupo com os gráficos do grupo marcados, e marca todos ou nenhum', () => {
    const fixture = TestBed.createComponent(RelatorioCapaModalComponent);
    fixture.componentRef.setInput('graficoOpcoes', SQUEEZE_REPORT_CHARTS);
    fixture.componentRef.setInput('prefill', { graficosOperacionaisSelecionados: ['cronograma', 'fracture-risk'] });
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const modal = fixture.componentInstance;
    expect(modal.form.graficosOperacionaisSelecionados).toEqual(['cronograma', 'uca', 'fracture-risk']);
    const boxes = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-grafico-opcoes] input[type="checkbox"]');
    expect(boxes).toHaveLength(SQUEEZE_REPORT_CHARTS.length);
    modal.selectAllGraficos(true);
    expect(modal.form.graficosOperacionaisSelecionados).toEqual(SQUEEZE_REPORT_CHARTS.map(option => option.id));
    modal.toggleGrafico('uca', { target: { checked: false } } as unknown as Event);
    expect(modal.form.graficosOperacionaisSelecionados).not.toContain('uca');
    modal.selectAllGraficos(false);
    expect(modal.form.graficosOperacionaisSelecionados).toEqual([]);
  });
});
