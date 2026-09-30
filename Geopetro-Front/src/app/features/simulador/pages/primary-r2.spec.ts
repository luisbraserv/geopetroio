import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subject, of } from 'rxjs';
import { SimuladorPrimariaComponent } from './simulador-primaria/simulador-primaria.component';
import { OperationContextService } from '../services/operation-context.service';
import { PrimaryScenarioStoreService } from '../services/primary-scenario-store.service';
import { SimuladorStateApiService, type CenarioApi, type PastaApi } from '../services/simulador-state-api.service';
import { PrimaryScenarioModalComponent } from '../components/state-modal/primary-scenario-modal.component';
import { RelatorioBuilderService } from '../components/relatorio/relatorio-builder.service';
import { parsePrimaryScenario } from '../services/primary-scenario-codec';
import { exportPrimaryScenario, importPrimaryScenario } from '../services/primary-scenario-portable';
import { createPrimaryReportData, parsePrimaryReportData } from '../models/primary-report-data.model';
import { buildPrimaryReport } from '../services/primary-report';

afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
function page(selected = true) {
  const fixture = TestBed.createComponent(SimuladorPrimariaComponent);
  const component = fixture.componentInstance;
  if (selected) component.selectOperationPhase('open');
  fixture.detectChanges();
  return { component, fixture };
}
const saved = (formValue: string, dadosRelatorio: string | null = null): CenarioApi => ({ id: 10,
  nome: 'Operação A', operacao: 'primaria', pastaId: 7, pastaNome: 'Campanha', formValue, dadosRelatorio,
  criadoPor: 'teste', criadoEm: '', atualizadoEm: '2026-09-19T12:00:00Z' });

describe('R2 — fase, receitas e documento', () => {
  it('requires an explicit phase and clears every operational result when selection is removed', () => {
    const { component: c } = page(false);
    expect(c.selectedPhaseId()).toBeNull();
    expect(c.volumes().valid).toBe(false);
    expect(c.transport()).toBeNull();
    expect(c.recipes().placements).toEqual([]);
    expect(c.report().canIssue).toBe(false);
    c.selectOperationPhase('open');
    expect(c.volumes().valid).toBe(true);
    expect(c.recipes().placements.length).toBeGreaterThan(0);
    c.selectOperationPhase(null);
    expect(c.hydraulics()).toBeNull();
    expect(c.recipes().placements).toEqual([]);
  });

  it('excludes later phases from calculation while retaining the whole well in the scenario', () => {
    const { component: c } = page();
    const before = c.volumes().totalCementPlannedBbl;
    c.addPhase();
    const later = c.phaseForms.at(2);
    later.patchValue({ topMD: 1500, bottomMD: 2200, topTVD: 1500, bottomTVD: 2200, holeDiameterIn: 6 });
    c.onPhaseEdit();
    expect(c.context().geometry.phases.map(p => p.id)).toEqual(['surface', 'open']);
    expect(c.context().geometry.finalMD).toBe(1500);
    expect(c.volumes().totalCementPlannedBbl).toBeCloseTo(before, 9);
    expect(c.scenario().fases).toHaveLength(3);
    expect(c.scenario().wellFinalMD).toBe(2200);
  });

  it('preserves inputs across a phase switch and rejects incompatible intervals', () => {
    const { component: c } = page();
    const operation = structuredClone(c.form().stages);
    const fluids = structuredClone(c.form().fluids);
    c.selectOperationPhase('surface');
    expect(c.form().stages).toEqual(operation);
    expect(c.form().fluids).toEqual(fluids);
    expect(c.form().shoeMD).toBe(300);
    expect(c.form().casingIdIn).toBe(8.535);
    expect(c.volumes().valid).toBe(false);
    c.selectOperationPhase('open');
    expect(c.volumes().valid).toBe(true);
  });

  it('keeps a missing selected id for repair and refuses duplicate and overlapping phases', () => {
    const { component: c } = page();
    const well = c.fullWell();
    const resolver = TestBed.inject(OperationContextService);
    expect(resolver.resolve(well, 'removed', 'primaria').phase).toBeNull();
    expect(resolver.resolve({ ...well, phases: [...well.phases, well.phases[1]] }, 'open', 'primaria').phase).toBeNull();
    const overlap = { ...well.phases[1], id: 'overlap', topMD: 1400, bottomMD: 1700 };
    expect(resolver.resolve({ ...well, phases: [...well.phases, overlap] }, 'open', 'primaria').issues.map(i => i.code)).toContain('OPERATION_PHASE_OVERLAP');
    c.removePhase(1);
    expect(c.selectedPhaseId()).toBe('open');
    expect(c.report().canIssue).toBe(false);
  });

  it('requires primary casing geometry and enforces legacy operation bounds within the phase', () => {
    const { component: c } = page();
    const resolver = TestBed.inject(OperationContextService);
    const well = c.fullWell();
    const ctx = resolver.resolve(well, 'open', 'squeeze');
    expect(resolver.validateInterval(ctx, { topMD: 200, bottomMD: 600 }, 'Squeeze')).toHaveLength(1);
    expect(resolver.validateInterval(ctx, { topMD: 300, bottomMD: 1500 })).toEqual([]);
    const noCasing = { ...well, phases: well.phases.map(p => p.id === 'open' ? { ...p, casing: undefined } : p) };
    expect(resolver.resolve(noCasing, 'open', 'primaria').issues.map(i => i.code)).toContain('PRIMARY_PHASE_CASING_REQUIRED');
  });

  it('reads casing dimensions exclusively from the phase and does not move stage inputs', () => {
    const { component: c } = page();
    c.setField('shoeMD', '1800');
    expect(c.form().shoeMD).toBe(1500);
    c.phaseForms.at(1).patchValue({ bottomMD: 1600, bottomTVD: 1600, shoeMD: 1600, shoeTVD: 1600, casingID: 6.1 });
    c.onPhaseEdit();
    expect(c.form().shoeMD).toBe(1600);
    expect(c.form().casingIdIn).toBe(6.1);
    expect(c.form().stages[0].outletMD).toBe(1500);
  });

  it('exports and migrates v1 with no automatic phase selection or lost composition', () => {
    const { component: c } = page();
    c.addAditivoCatalogo(c.catalogoAditivos[0]);
    const current = c.scenario();
    const legacy = { ...current, schemaVersion: 1, selectedPhaseId: undefined };
    const migrated = parsePrimaryScenario(JSON.stringify(legacy));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.selectedPhaseId).toBeNull();
    expect(migrated.primary.fluids).toEqual(current.primary.fluids);
    const v1 = { ...JSON.parse(exportPrimaryScenario(current)), exportVersion: 1, scenario: legacy, dadosRelatorio: undefined };
    expect(importPrimaryScenario(JSON.stringify(v1)).dadosRelatorio.cliente).toBe('');
    expect(importPrimaryScenario(JSON.stringify(v1)).scenario.selectedPhaseId).toBeNull();
  });

  it('round trips all report metadata, notes, logo and recipe parameters through v2', () => {
    const { component: c } = page();
    c.setCliente('Cliente A'); c.setReportField('revisadoPor', 'Revisor');
    c.setReportField('clienteLogoImagem', 'data:image/png;base64,YWJj');
    c.setSequenceNote('stepNotes', c.form().stages[0].steps[0].id, 'Conferir mistura');
    c.setRecipeParameters('source', 'manual'); c.setRecipeParameters('yieldFt3', '1.3');
    c.setRecipeParameters('facGpc', '4.5'); c.setRecipeParameters('famGpc', '4.8');
    const imported = importPrimaryScenario(c.exportarArquivo()!);
    expect(imported.scenario.selectedPhaseId).toBe('open');
    expect(imported.dadosRelatorio.cliente).toBe('Cliente A');
    expect(imported.dadosRelatorio.revisadoPor).toBe('Revisor');
    expect(imported.dadosRelatorio.sequence.stepNotes[c.form().stages[0].steps[0].id]).toBe('Conferir mistura');
    expect(imported.scenario.primary.fluids.find(f => f.id === 'cement')?.recipeParameters?.source).toBe('manual');
    expect(parsePrimaryReportData(imported.dadosRelatorio).clienteLogoImagem).toContain('base64');
  });

  it('rejects unknown report data without adopting it', () => {
    const { component: c } = page(); const previous = c.form();
    const file = JSON.parse(c.exportarArquivo()!); file.dadosRelatorio = { reportSchemaVersion: 999 };
    c.lerArquivo(JSON.stringify(file));
    expect(c.importSummary()).toBeNull(); expect(c.form()).toBe(previous);
    expect(() => parsePrimaryReportData({ ...createPrimaryReportData(), clienteLogoImagem: 'javascript:alert(1)' })).toThrow();
  });

  it('keeps additives independent and includes every placement recipe regardless of the active editor', () => {
    const { component: c } = page();
    c.renameSlurry('Lead'); c.addAditivoCatalogo(c.catalogoAditivos[0]);
    const lead = structuredClone(c.selectedRecipe());
    c.addSlurry(); const tail = c.cementFluids().at(-1)!; c.selectSlurry(tail.id); c.renameSlurry('Tail');
    c.addAditivoCatalogo(c.catalogoAditivos[1]); c.addPlacement(0);
    expect(c.form().stages[0].placements[1].fluidId).toBe(tail.id);
    c.selectSlurry('cement'); expect(c.selectedRecipe()).toEqual(lead);
    const sections = c.report().sections.filter(s => s.id.startsWith('receita-'));
    expect(sections).toHaveLength(2);
    expect(sections.map(s => s.title).join(' ')).toContain('Tail');
    expect(sections.map(s => s.title).join(' ')).toContain('Lead');
    expect(sections.every(s => s.table?.headers.includes('Quantidade'))).toBe(true);
    expect(c.report().sections.some(s => /consolid/i.test(s.title))).toBe(false);
  });

  it('uses manual recipe parameters and reserve only for material preparation', () => {
    const { component: c } = page(); const planned = c.volumes().totalCementPlannedBbl;
    c.setRecipeParameters('source', 'manual'); expect(c.recipes().placements[0].error).toBeTruthy();
    c.setRecipeParameters('yieldFt3', '1.3'); c.setRecipeParameters('facGpc', '4.5'); c.setRecipeParameters('famGpc', '4.8');
    c.setMixingReserve(0, 0, '10');
    const recipe = c.recipes().placements[0];
    expect(recipe.error).toBeFalsy(); expect(recipe.parameterSource).toBe('manual');
    expect(recipe.yieldFt3PerFt3Cement).toBeCloseTo(1.3, 9);
    expect(recipe.preparedBbl - recipe.pumpedBbl).toBeCloseTo(10, 9);
    expect(c.volumes().totalCementPlannedBbl).toBe(planned);
    c.setRecipeParameters('source', 'calculated');
    expect(c.recipes().placements[0].parameterSource).toBe('calculated');
  });

  it('derives sequence numbers from ordered steps, preserves notes and converts report depths', () => {
    const { component: c } = page(); const id = c.form().stages[0].steps[0].id;
    c.setSequenceNote('stepNotes', id, 'Conferir retorno'); c.setStepRate(0, id, '6');
    expect(c.sequencePreview().join(' ')).toContain('6 bpm');
    expect(c.sequencePreview().join(' ')).toContain('Conferir retorno');
    const result = c.result(); c.setDepthUnit('ft'); expect(c.result()).toBe(result);
    expect(c.report().sections.find(s => s.id === 'geometria')?.rows?.find(r => r.label === 'Sapata')?.value).toBe('4.921,3 ft');
    expect(c.sequencePreview().join(' ')).toContain('ft MD');
    c.removeStepAt(0, 0); expect(c.reportData().sequence.stepNotes[id]).toBeUndefined();
  });

  it('blocks direct final export methods while still allowing draft preview', () => {
    const { component: c } = page(false);
    const builder = TestBed.inject(RelatorioBuilderService);
    const download = vi.spyOn(builder, 'downloadAsWord').mockImplementation(() => {});
    const preview = vi.spyOn(builder, 'openInNewTab').mockImplementation(() => {});
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    c.baixarRelatorio(); c.imprimirRelatorio(); c.visualizarRelatorio();
    expect(download).not.toHaveBeenCalled(); expect(opened).not.toHaveBeenCalled();
    expect(preview).toHaveBeenCalledWith(expect.stringContaining('RASCUNHO'));
  });

  it('blocks exceeded equipment limits even with complete physical calculations', () => {
    const { component: c } = page();
    const result = c.result();
    const report = buildPrimaryReport({ scenarioName: 'Limites', scenarioId: null, savedAt: null, schemaVersion: 2,
      generatedAt: '', cliente: '', poco: '', primary: result.primary, volumes: c.volumes(), recipes: c.recipes(),
      transport: { ...c.transport()!, status: 'complete', diagnostics: [] },
      hydraulics: { ...c.hydraulics()!, status: 'complete', diagnostics: [], points: [],
        breaches: [{ limit: 'pump-rate', stageId: 'stage-1', stepId: 'pump', startTimeMin: 0, endTimeMin: 1, peakValue: 10, limitValue: 8 }] },
      measurements: [], volumeAxis: 'total-pumped', depthUnit: 'm', hasSlurryCurves: false });
    expect(report.status).toBe('complete'); expect(report.canIssue).toBe(false);
    expect(report.blockingReasons.join(' ')).toContain('Limite excedido');
  });

  it('starts with seven collapsed groups and opens the corresponding fields independently', () => {
    const { component: c, fixture } = page(); const result = c.result();
    const root: HTMLElement = fixture.nativeElement;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.sidebar-section-title button')];
    const expected = [
      ['1. Dados do relatório', 'Cliente'], ['2. Sequência operacional', 'Preparação'],
      ['3. Dados da operação', '3.1 Poço e fases'], ['4. Fluidos e bombeio', '4.1 Fluidos'],
      ['5. Pasta', 'Acrescentar pasta'], ['6. Aditivos', 'Acrescentar do catálogo'],
      ['7. Medições e apresentação', '7.2 Medições'],
    ];
    expect(buttons).toHaveLength(7);
    expect(buttons.map(b => b.textContent?.trim())).toEqual(expected.map(([title]) => title));
    const panels = buttons.map(b => root.querySelector<HTMLElement>('#' + b.getAttribute('aria-controls'))!);
    expect(panels.every(panel => panel.hidden)).toBe(true);
    for (const [i, button] of buttons.entries()) {
      button.click(); fixture.detectChanges();
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(panels[i].hidden).toBe(false);
      expect(panels[i].textContent).toContain(expected[i][1]);
      expect(panels.filter((_, j) => j !== i).every(panel => panel.hidden)).toBe(true);
      button.click(); fixture.detectChanges();
      expect(panels[i].hidden).toBe(true);
      expect(button.getAttribute('aria-expanded')).toBe('false');
    }
    expect(c.result()).toBe(result);
  });

  it('preserves a typed report field when sections and the whole panel are collapsed', () => {
    const { component: c, fixture } = page();
    const root: HTMLElement = fixture.nativeElement;
    const report = root.querySelector<HTMLButtonElement>('#primary-heading-report')!;
    report.click(); fixture.detectChanges();
    const client = root.querySelector<HTMLInputElement>('#primary-section-report input')!;
    client.value = 'Cliente da operação'; client.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const result = c.result();
    report.click(); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.head-actions .sidebar-toggle')!.click(); fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.sidebar-dock [aria-controls="primary-sidebar"]')!.click(); fixture.detectChanges();
    report.click(); fixture.detectChanges();
    expect(client.value).toBe('Cliente da operação'); expect(c.cliente()).toBe(client.value);
    expect(c.result()).toBe(result); expect(c.sidebarOpen()).toBe(true);
  });

  it('opens the well subsection and selects the working phase through the menu', () => {
    const { component: c, fixture } = page(false);
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('#primary-heading-operation')!.click(); fixture.detectChanges();
    const well = [...root.querySelectorAll<HTMLButtonElement>('#primary-section-operation button[tuiAccordion]')]
      .find(button => button.textContent?.includes('3.1 Poço e fases'))!;
    well.click(); fixture.detectChanges();
    expect(well.getAttribute('aria-expanded')).toBe('true');
    expect(c.secWellOpen).toBe(true); expect(c.secTargetOpen).toBe(false);
    const phase = root.querySelector<HTMLSelectElement>('select[aria-label="Fase da operação"]')!;
    expect(phase.value).toBe(''); expect(c.volumes().valid).toBe(false);
    phase.value = 'open'; phase.dispatchEvent(new Event('change', { bubbles: true })); fixture.detectChanges();
    expect(c.selectedPhaseId()).toBe('open'); expect(c.volumes().valid).toBe(true);
    well.click(); fixture.detectChanges();
    expect(well.getAttribute('aria-expanded')).toBe('false'); expect(c.selectedPhaseId()).toBe('open');
  });
});

describe('R2 — gravação e pastas', () => {
  it('preserves changes made while another scenario is loading', async () => {
    const response = new Subject<CenarioApi>();
    TestBed.configureTestingModule({ providers: [{ provide: SimuladorStateApiService, useValue: { buscarCenario: () => response } }] });
    const { component: c } = page();
    const snapshot = JSON.stringify(c.scenario());
    const pending = c.abrirSalvo(10);
    c.setCliente('Editado durante a abertura');
    response.next(saved(snapshot)); response.complete(); await pending;
    expect(c.cliente()).toBe('Editado durante a abertura');
    expect(c.scenarioMessage()).toContain('alterações foram preservadas');
    expect(c.saveState().scenarioId).toBeNull();
  });

  it('retains inactive additives in the file without adding them to the recipe', () => {
    const { component: c } = page();
    c.addAditivoCatalogo(c.catalogoAditivos[0]);
    c.additiveForms.at(0).get('ativo')?.setValue(false); c.onAditivoEdit();
    expect(c.selectedRecipe()?.additivos[0].ativo).toBe(false);
    expect(c.recipes().placements[0].rows.some(row => row.productName === c.catalogoAditivos[0].name)).toBe(false);
    expect(importPrimaryScenario(c.exportarArquivo()!).scenario.primary.fluids.find(f => f.id === 'cement')?.recipe?.additivos[0].ativo).toBe(false);
  });

  it('does not mark edits made during save as saved or issue duplicate requests', async () => {
    const response = new Subject<CenarioApi>(); const criarCenario = vi.fn(() => response);
    TestBed.configureTestingModule({ providers: [{ provide: SimuladorStateApiService, useValue: { criarCenario } }] });
    const { component: c, fixture } = page(); const store = fixture.debugElement.injector.get(PrimaryScenarioStoreService);
    const pending = store.salvar(c.scenario(), { nome: 'A', pastaId: 7 });
    expect(store.saveState().status).toBe('saving');
    store.markDirty(); expect(await store.salvar(c.scenario(), { nome: 'B' })).toBeNull();
    response.next(saved(JSON.stringify(c.scenario()))); response.complete(); await pending;
    expect(store.saveState().status).toBe('unsaved'); expect(criarCenario).toHaveBeenCalledTimes(1);
  });

  it('restores folder, full metadata and selection from a database response', async () => {
    const api = { buscarCenario: vi.fn(), criarCenario: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: SimuladorStateApiService, useValue: api }] });
    const { component: c } = page(); const document = { ...createPrimaryReportData(), cliente: 'Cliente salvo', preparadoPor: 'Ana' };
    api.buscarCenario.mockReturnValue(of(saved(JSON.stringify(c.scenario()), JSON.stringify(document))));
    await c.abrirSalvo(10);
    expect(c.currentFolderId()).toBe(7); expect(c.cliente()).toBe('Cliente salvo');
    expect(c.reportData().preparadoPor).toBe('Ana'); expect(c.selectedPhaseId()).toBe('open');
    expect(c.saveState().status).toBe('saved');
    api.criarCenario.mockReturnValue(of({ ...saved('{}'), id: 11 }));
    await c.salvarCenario({ nome: 'Cópia', pastaId: 7, asNew: true });
    expect(c.saveState().scenarioId).toBe(11);
    expect(JSON.parse(api.criarCenario.mock.calls[0][0].dadosRelatorio).preparadoPor).toBe('Ana');
  });

  it('folder navigation does not change the explicit save destination and deletion needs confirmation', async () => {
    const pasta = { id: 7, nome: 'Campanha', totalCenarios: 2, operacao: 'primaria' } as PastaApi;
    const api = { listarPastas: vi.fn(() => of([pasta])), listarCenarios: vi.fn(() => of([saved('{}'), { ...saved('{}'), id: 11 }])),
      listarSemPasta: vi.fn(() => of([])), excluirPasta: vi.fn(() => of(undefined)) };
    TestBed.configureTestingModule({ providers: [{ provide: SimuladorStateApiService, useValue: api }] });
    const modal = TestBed.createComponent(PrimaryScenarioModalComponent).componentInstance;
    modal.destinationId = 7; modal.navigate(null); await modal.refresh();
    expect(modal.destinationId).toBe(7); expect(api.listarSemPasta).toHaveBeenCalledWith('primaria');
    await modal.prepareFolderDelete(pasta);
    expect(modal.deletion()).toMatchObject({ name: 'Campanha', count: 2 });
    expect(api.excluirPasta).not.toHaveBeenCalled();
    await modal.confirmDelete(); expect(api.excluirPasta).toHaveBeenCalledWith(7);
    expect(modal.destinationId).toBeNull();
  });
});
