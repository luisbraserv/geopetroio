import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SimuladorPrimariaComponent } from './simulador-primaria.component';

afterEach(() => TestBed.resetTestingModule());

/**
 * P12: a tela renderiza cada aba com o conteúdo esperado. Isto **não** substitui
 * a revisão visual humana pedida em §11.3 — jsdom não avalia layout, largura de
 * tela nem impressão. O que se verifica aqui é que nada quebra e que o texto
 * certo chega ao DOM.
 */
function create(): { fixture: ComponentFixture<SimuladorPrimariaComponent>;
  component: SimuladorPrimariaComponent; text: () => string } {
  const fixture = TestBed.createComponent(SimuladorPrimariaComponent);
  fixture.componentInstance.selectOperationPhase('open');
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance,
    text: () => (fixture.nativeElement as HTMLElement).textContent ?? '' };
}

describe('primary page renders every tab (P12)', () => {
  it('uses the squeeze skeleton: horizontal tabs, sidebar and floating dock', () => {
    const { fixture, component, text } = create();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.sim')).not.toBeNull();
    expect(root.querySelectorAll('.sim-tabs .sim-tab').length).toBe(component.tabs.length);
    expect(root.querySelector('.sim-body')).not.toBeNull();
    expect(root.querySelector('.sim-sidebar')).not.toBeNull();
    expect(root.querySelectorAll('.sidebar-dock .sidebar-dock-btn').length).toBe(3);
    expect(text()).toContain('Cimentação Primária');
    for (const label of ['1. Volumes e programa', '2. Receita da pasta', '3. Simulador',
      '4. Esquemático', '5. Dados medidos'])
      expect(text()).toContain(label);
    // Transporte e envelope por profundidade não são mais abas.
    expect(text()).not.toContain('Transporte');
    expect(text()).not.toContain('Envelope por profundidade');
    // Sem gráfico na tela, não há aba de gráficos.
    expect(text()).not.toContain('Gráficos');
  });

  it('collapses the sidebar from the dock without losing the content', () => {
    const { fixture, component } = create();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.sim-sidebar--hidden')).toBeNull();
    root.querySelector<HTMLButtonElement>('.sidebar-dock [aria-controls="primary-sidebar"]')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.sim-sidebar--hidden')).not.toBeNull();
    expect(root.querySelector('.sim-body--collapsed')).not.toBeNull();
    expect(root.querySelector('.sim-main')).not.toBeNull();
    const headerToggle = root.querySelector<HTMLButtonElement>('.head-actions .sidebar-toggle')!;
    expect(headerToggle.getAttribute('aria-label')).toBe('Exibir painel');
    headerToggle.click(); fixture.detectChanges();
    expect(root.querySelector('.sim-sidebar--hidden')).toBeNull();
    expect(headerToggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the scenarios out of the page body and inside the dock modal', () => {
    const { fixture, component, text } = create();
    const root: HTMLElement = fixture.nativeElement;
    // A barra de cenário saiu do corpo: nada dela aparece antes do clique.
    expect(root.querySelector('.psm-modal')).toBeNull();
    expect(text()).not.toContain('Salvar no banco');

    component.abrirCenarios();
    fixture.detectChanges();
    expect(root.querySelector('.psm-modal')).not.toBeNull();
    expect(text()).toContain('Salvar no banco');
    expect(text()).toContain('Exportar arquivo');
    expect(text()).toContain('Não salvo');

    component.cenariosOpen.set(false);
    fixture.detectChanges();
    expect(root.querySelector('.psm-modal')).toBeNull();
  });

  it('adopts an imported scenario and closes the modal', () => {
    const { fixture, component } = create();
    const json = component.exportarArquivo()!;
    component.abrirCenarios();
    component.lerArquivo(json);
    fixture.detectChanges();
    expect(component.importSummary()).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Adotar cenário');
    component.confirmarImportacao();
    fixture.detectChanges();
    expect(component.cenariosOpen()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.psm-modal')).toBeNull();
  });

  it('keeps every data field in the sidebar and none in the content', () => {
    const { fixture, component } = create();
    const root: HTMLElement = fixture.nativeElement;
    for (const tab of ['volumes', 'receita', 'simulador', 'esquematico', 'medicoes'] as const) {
      component.tab.set(tab);
      fixture.detectChanges();
      const main = root.querySelector('.sim-main')!;
      // Controles de reprodução e do visualizador 3D navegam resultado, não
      // são entrada de dado: ficam no conteúdo de propósito.
      const fields = [...main.querySelectorAll('input, select, textarea')]
        .filter(field => !field.closest('.pr-playback') && !field.closest('app-well-3d')
          && !(field instanceof HTMLSelectElement && field.querySelector('option[value="all"]')));
      expect(fields.map(field => field.outerHTML)).toEqual([]);
    }
    // E a sidebar tem, sim, campos.
    expect(root.querySelectorAll('.sim-sidebar input, .sim-sidebar select').length)
      .toBeGreaterThan(5);
  });

  it('renders each tab without throwing', () => {
    const { fixture, component, text } = create();
    for (const tab of ['receita', 'simulador', 'esquematico', 'medicoes'] as const) {
      component.tab.set(tab);
      expect(() => fixture.detectChanges()).not.toThrow();
      expect(text().length).toBeGreaterThan(200);
    }
  });

  it('shows the dimensioned volumes, the real placement and the schedule on tab 1', () => {
    const { fixture, component, text } = create();
    component.tab.set('volumes');
    fixture.detectChanges();
    expect(text()).toContain('Resumo da operação');
    expect(text()).toContain('Volumes por colocação');
    expect(text()).toContain('TOC ideal e colocação real');
    // O cronograma que era gráfico agora é tabela, com a coluna de duração.
    expect(text()).toContain('Cronograma do programa');
    expect(text()).toContain('Duração (min)');
    expect(text()).toContain('Deslocamento alvo');
    expect(text()).toContain('74.10');
  });

  it('shows the pressures and the charts on the simulator tab, without the depth-envelope table', () => {
    const { fixture, component, text } = create();
    const root: HTMLElement = fixture.nativeElement;
    component.tab.set('simulador');
    fixture.detectChanges();
    expect(text()).toContain('BHP máximo');
    // A queda livre do caso base é resolvida e anunciada, não escondida nem interrompida.
    expect(text()).toContain('Queda livre entre');
    expect(text()).not.toContain('fora do modelo');
    // A tabela do envelope saiu da tela; o gráfico de envelope continua entre os três.
    expect(text()).not.toContain('Envelope por profundidade');
    expect(root.querySelector('[data-chart="envelope"]')).not.toBeNull();
    expect(root.querySelector('.sim-main .pr-playback')).toBeNull();
  });

  it('keeps the playback inside the 2D schematic, at 3x by default, with the state it moves', () => {
    const { fixture, component, text } = create();
    const root: HTMLElement = fixture.nativeElement;
    for (const tab of ['volumes', 'receita', 'simulador', 'medicoes'] as const) {
      component.tab.set(tab);
      fixture.detectChanges();
      expect(root.querySelector('.sim-main .pr-playback')).toBeNull();
    }
    component.tab.set('esquematico');
    fixture.detectChanges();
    const playback = root.querySelectorAll('.sim-main .pr-playback');
    expect(playback).toHaveLength(1);
    expect(playback[0].closest('.pr-block')!.querySelector('h2')!.textContent).toBe('Esquemático 2D');
    expect(component.speed()).toBe(3);
    const speed = playback[0].querySelector('select')!;
    expect([...speed.options].map(option => option.textContent)).toEqual(['3×', '5×', '20×', '60×']);
    expect(speed.value).toBe('3');
    expect(text()).toContain('Estado no instante selecionado');
    expect(text()).toContain('ECD nas referências');
  });

  it('calculates the spacer from the slurry annulus and the contact time, with a field to inform another volume', () => {
    const { fixture, component, text } = create();
    const root: HTMLElement = fixture.nativeElement;
    component.addSpacer(0);
    fixture.detectChanges();
    const step = component.volumes().stages[0].steps.find(s => s.fluidId === 'spacer')!;
    const basis = step.preflush!;
    const bottom = [...component.volumes().stages[0].placements].sort((a, b) => b.bottomMD - a.bottomMD)[0];
    // V = máx(8 min × 5 bpm, 152,4 m × capacidade anular da pasta de fundo).
    expect(basis.contactBbl).toBeCloseTo(40, 12);
    expect(basis.capacityBblM).toBeCloseTo(bottom.annularBbl / (bottom.bottomMD - bottom.topMD), 12);
    expect(step.volumeBbl).toBeCloseTo(Math.max(40, 152.4 * basis.capacityBblM!), 9);
    expect(component.fluidProgrammedVolume('spacer')).toBeCloseTo(step.volumeBbl, 9);
    expect(text()).toContain('Calculado pelo simulador');
    expect(text()).toContain('Volume (bbl) · calculado');
    expect(root.querySelectorAll('[data-preflush-field]')).toHaveLength(2);

    // Volume digitado substitui o calculado; o botão volta ao calculado.
    component.setFluidVolume('spacer', '55');
    fixture.detectChanges();
    expect(component.fluidProgrammedVolume('spacer')).toBe(55);
    expect(text()).toContain('O volume informado substitui o calculado.');
    expect(text()).toContain('Volume (bbl) · informado');
    root.querySelector<HTMLButtonElement>('[data-preflush] .pr-link')!.click();
    fixture.detectChanges();
    expect(component.fluidProgrammedVolume('spacer')).toBeCloseTo(step.volumeBbl, 9);
    expect(text()).not.toContain('O volume informado substitui o calculado.');

    // O critério também é editável: 10 min de contato a 5 bpm.
    component.setPreflushCriterion('spacer', 'contactTimeMin', '10');
    fixture.detectChanges();
    const tenMinutes = component.volumes().stages[0].steps.find(s => s.fluidId === 'spacer')!;
    expect(tenMinutes.preflush!.contactBbl).toBeCloseTo(50, 12);
    // Repetir divide o critério: a soma dos dois passos continua a do colchão inteiro.
    const index = component.form().stages[0].steps.findIndex(s => s.kind === 'pump' && s.fluidId === 'spacer');
    component.repeatStepAt(0, index);
    fixture.detectChanges();
    const split = component.volumes().stages[0].steps.filter(s => s.fluidId === 'spacer');
    expect(split).toHaveLength(2);
    expect(split[0].volumeBbl + split[1].volumeBbl).toBeCloseTo(tenMinutes.volumeBbl, 9);
  });

  it('says the slurry curves were removed instead of drawing them', () => {
    const { fixture, component, text } = create();
    component.tab.set('receita');
    fixture.detectChanges();
    expect(text()).toContain('foram removidas da tela');
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
  });

  it('lists two slurries with their own origin once a second one is added', () => {
    const { fixture, component, text } = create();
    component.addSlurry();
    component.tab.set('receita');
    fixture.detectChanges();
    const cements = component.form().fluids.filter(entry => entry.kind === 'cement');
    expect(cements).toHaveLength(2);
    for (const cement of cements) expect(text()).toContain(cement.name);
    expect(text()).toContain('Quantidades por colocação');
    expect(text()).toContain('Rendimento (ft³/ft³)');
  });

  it('keeps the numbers unchanged when the depth unit changes', () => {
    const { fixture, component } = create();
    const before = component.volumes().stages[0].placements[0].plannedBbl;
    const bhp = component.hydraulics()!.points.find(point => point.bhpPsi !== null)!.bhpPsi;
    component.depthUnit.set('ft');
    fixture.detectChanges();
    // Unidade é apresentação: volume em bbl e pressão em psi não mudam.
    expect(component.volumes().stages[0].placements[0].plannedBbl).toBeCloseTo(before, 12);
    expect(component.hydraulics()!.points.find(point => point.bhpPsi !== null)!.bhpPsi)
      .toBeCloseTo(bhp!, 12);
  });

  it('shows the window only in the open hole when a previous casing exists', () => {
    const { component } = create();
    const cased = component.hydraulics()!.envelope.filter(entry => entry.md < 300);
    expect(cased.length).toBeGreaterThan(0);
    for (const entry of cased) expect(entry.fracturePsi).toBeNull();
    expect(component.hydraulics()!.envelope.some(entry => entry.md > 300 && entry.fracturePsi !== null))
      .toBe(true);
  });

  it('reports returned cement as an identified diagnostic, not as a loss', () => {
    const { fixture, component, text } = create();
    // Pasta muito além do necessário: o excedente retorna à superfície.
    component.setTargetToc(0, '0');
    const stage = component.form().stages[0];
    component.setStage(0, { steps: [
      { id: 'extra', kind: 'pump', fluidId: 'cement', rateBpm: 5,
        quantity: { source: 'reserve-extra', placementId: 'cement-1', volumeBbl: 60 } },
      ...stage.steps] });
    fixture.detectChanges();
    const codes = component.diagnostics().map(entry => entry.code);
    expect(codes).toContain('PRIMARY_CEMENT_RETURNED');
    const returned = component.diagnostics().find(entry => entry.code === 'PRIMARY_CEMENT_RETURNED')!;
    expect(returned.severity).toBe('info');
    expect(returned.message).toContain('retornaram à superfície');
    expect(codes).not.toContain('PRIMARY_LOSS');
    expect(text()).toContain('PRIMARY_CEMENT_RETURNED');
  });

  it('keeps the schematic and the 3D on the same selected instant', () => {
    const { fixture, component, text } = create();
    component.tab.set('esquematico');
    component.onCursor(String(component.totalTimeMin()));
    fixture.detectChanges();
    expect(text()).toContain('Poço e revestimento-alvo');
    expect(text()).toContain('Esquemático 2D');
    expect(text()).toContain('Visão 3D');
    // O 3D só inicia quando pedido: WebGL não é carregado à toa.
    expect(text()).toContain('Mostrar 3D');
    expect(component.schematicState().snapshot!.timeMin)
      .toBe(component.selection().snapshot!.timeMin);
    expect(component.overlays().length).toBeGreaterThan(0);
  });
});
