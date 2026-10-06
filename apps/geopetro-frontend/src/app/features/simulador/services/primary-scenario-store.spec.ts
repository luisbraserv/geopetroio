import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { primaryContractExample } from '../models/primary-cementing.examples';
import type { PocoApi } from '../models/poco.model';
import type { PrimaryScenario } from '../models/primary-scenario.model';
import { PrimaryScenarioError } from './primary-scenario-codec';
import { exportPrimaryScenario, importPrimaryScenario, PRIMARY_EXPORT_KIND,
  PRIMARY_EXPORT_VERSION, summarizePrimaryScenario } from './primary-scenario-portable';
import { PrimaryScenarioStoreService } from './primary-scenario-store.service';
import { SimuladorStateApiService, type CenarioApi } from './simulador-state-api.service';

afterEach(() => TestBed.resetTestingModule());

function measured(scenario: PrimaryScenario): PrimaryScenario {
  return { ...scenario, measurements: [{
    id: 'ds', schemaVersion: 1, name: 'Retorno', importedAt: '2026-09-18T12:00:00Z',
    sourceFileName: 'op.csv', mapping: { ret: { column: 'retorno', originalUnit: 'L/min' } },
    alignment: { offsetMin: 5, timezone: 'UTC', originTimestamp: '2026-09-18T11:00:00Z' },
    maxInterpolationGapMin: 3,
    channels: [{ id: 'ret', name: 'Retorno', location: 'Saída', quantity: 'return-rate', unit: 'bpm' }],
    samples: [{ sourceRow: 2, timeMin: 2, values: { ret: 3 } }],
    importDiagnostics: [{ sourceRow: 3, field: 'retorno', rawValue: 'x',
      reason: 'Valor não numérico.', resolution: 'missing-value' }],
  }] };
}

const cenario = (over: Partial<CenarioApi> = {}): CenarioApi => ({
  id: 7, nome: 'Poço A — primária', operacao: 'primaria', pastaId: null, pastaNome: null,
  formValue: '{}', dadosRelatorio: null, criadoPor: 'luis', criadoEm: '2026-09-18T10:00:00Z',
  atualizadoEm: '2026-09-18T12:00:00Z', ...over });

function store(api: Partial<SimuladorStateApiService>): PrimaryScenarioStoreService {
  TestBed.configureTestingModule({
    providers: [{ provide: SimuladorStateApiService, useValue: api }],
  });
  return TestBed.inject(PrimaryScenarioStoreService);
}

describe('primary scenario persistence and portability (P10)', () => {
  it('sends the existing contract with operacao primaria', async () => {
    const criarCenario = vi.fn().mockReturnValue(of(cenario()));
    const service = store({ criarCenario });
    const saved = await service.salvar(primaryContractExample('conventional'), { nome: 'Poço A' });
    expect(saved!.id).toBe(7);
    const body = criarCenario.mock.calls[0][0];
    expect(body.operacao).toBe('primaria');
    expect(body.nome).toBe('Poço A');
    expect(JSON.parse(body.formValue).operation).toBe('primaria');
    expect(service.saveState().status).toBe('saved');
    expect(service.saveState().scenarioId).toBe(7);
  });

  it('updates instead of creating once the scenario has an id', async () => {
    const criarCenario = vi.fn().mockReturnValue(of(cenario()));
    const atualizarCenario = vi.fn().mockReturnValue(of(cenario({ atualizadoEm: '2026-09-18T13:00:00Z' })));
    const service = store({ criarCenario, atualizarCenario });
    await service.salvar(primaryContractExample('conventional'), { nome: 'Poço A' });
    await service.salvar(primaryContractExample('conventional'), { nome: 'Poço A' });
    expect(criarCenario).toHaveBeenCalledTimes(1);
    expect(atualizarCenario).toHaveBeenCalledTimes(1);
    expect(atualizarCenario.mock.calls[0][0]).toBe(7);
  });

  it('never shows saved when the API fails, and keeps the work exportable', async () => {
    const service = store({ criarCenario: () => throwError(() => ({ status: 0 })) });
    const result = await service.salvar(primaryContractExample('conventional'), { nome: 'Poço A' });
    expect(result).toBeNull();
    expect(service.saveState().status).toBe('failed');
    expect(service.isSaved()).toBe(false);
    expect(service.saveState().message).toContain('exportado');
    // O cenário continua íntegro e pode virar arquivo.
    expect(() => exportPrimaryScenario(primaryContractExample('conventional'))).not.toThrow();
  });

  it('explains a well version conflict instead of overwriting', async () => {
    const service = store({ criarCenario: () => throwError(() => ({ status: 409 })) });
    await service.salvar(primaryContractExample('conventional'), { nome: 'Poço A' });
    expect(service.saveState().message).toContain('geometria do poço mudou');
  });

  it('refuses a payload that does not validate, without reaching the network', async () => {
    const criarCenario = vi.fn();
    const service = store({ criarCenario });
    const broken = primaryContractExample('conventional');
    broken.primary.stages[0].placements[0].fluidId = 'inexistente';
    const result = await service.salvar(broken, { nome: 'Poço A' });
    expect(result).toBeNull();
    expect(criarCenario).not.toHaveBeenCalled();
    expect(service.saveState().status).toBe('failed');
  });

  it('strips the linked well geometry and keeps the version', async () => {
    const criarCenario = vi.fn().mockReturnValue(of(cenario()));
    const service = store({ criarCenario });
    const scenario = primaryContractExample('conventional');
    const poco: PocoApi = { id: 12, nome: 'Poço A', version: 3,
      geometria: { wellFinalMD: scenario.wellFinalMD, wellFinalTVD: scenario.wellFinalTVD,
        fases: scenario.fases, trajectory: scenario.trajectory } } as PocoApi;
    await service.salvar(scenario, { nome: 'Poço A', poco });
    const body = criarCenario.mock.calls[0][0];
    expect(body.pocoId).toBe(12);
    expect(body.pocoVersion).toBe(3);
    // A geometria não é duplicada dentro do cenário vinculado.
    expect(JSON.parse(body.formValue).fases).toBeUndefined();
  });

  it('marks the scenario dirty again after an edit', async () => {
    const service = store({ criarCenario: () => of(cenario()) });
    await service.salvar(primaryContractExample('conventional'), { nome: 'Poço A' });
    expect(service.isSaved()).toBe(true);
    service.markDirty();
    expect(service.isSaved()).toBe(false);
    expect(service.saveState().scenarioId).toBe(7);
  });

  it('opens a scenario from the database as a draft', async () => {
    const scenario = primaryContractExample('conventional');
    const service = store({ buscarCenario: () => of(cenario({
      formValue: JSON.stringify(scenario) })) });
    const opened = await service.abrir(7);
    expect(opened.scenario.status).toBe('draft');
    expect(opened.scenario.primary.stages).toHaveLength(1);
    expect(service.saveState().status).toBe('saved');
  });

  it('round-trips the measurements and their alignment through the file', () => {
    const scenario = measured(primaryContractExample('conventional'));
    scenario.presentation.volumeAxis = 'cement-pumped';
    scenario.presentation.depthUnit = 'ft';
    const file = exportPrimaryScenario(scenario, { scenarioId: 7, pocoId: 12, pocoVersion: 3,
      scenarioName: 'Poço A' }, '2026-09-18T18:00:00Z');
    const imported = importPrimaryScenario(file);
    expect(imported.scenario.measurements[0].alignment).toEqual(scenario.measurements[0].alignment);
    expect(imported.scenario.measurements[0].mapping['ret'].originalUnit).toBe('L/min');
    expect(imported.scenario.measurements[0].importDiagnostics).toHaveLength(1);
    expect(imported.scenario.presentation.volumeAxis).toBe('cement-pumped');
    expect(imported.scenario.presentation.depthUnit).toBe('ft');
    // Geometria completa viaja no arquivo, mesmo com poço vinculado na origem.
    expect(imported.scenario.fases).toHaveLength(scenario.fases.length);
  });

  it('keeps database ids as provenance only, never as a link', () => {
    const file = exportPrimaryScenario(primaryContractExample('conventional'),
      { scenarioId: 7, pocoId: 12, pocoVersion: 3, scenarioName: 'Poço A' });
    const imported = importPrimaryScenario(file);
    expect(imported.summary.provenance.scenarioId).toBe(7);
    expect(imported.summary.provenance.pocoId).toBe(12);
    expect(imported.scenario.status).toBe('draft');
    expect(imported.scenario as unknown as Record<string, unknown>).not.toHaveProperty('id');
  });

  it('summarises the file before anything is adopted', () => {
    const scenario = measured(primaryContractExample('two-stage'));
    const summary = summarizePrimaryScenario(scenario, { scenarioName: 'Duas etapas' });
    expect(summary.stages).toBe(2);
    expect(summary.measurements).toBe(1);
    expect(summary.samples).toBe(1);
    expect(summary.steps).toBeGreaterThan(0);
  });

  it('rejects another operation, a future version and a missing one', () => {
    expect(() => importPrimaryScenario(JSON.stringify({ kind: 'geopetro-squeeze-scenario',
      exportVersion: 1, scenario: {} }))).toThrow(/não é um cenário de cimentação primária/);
    const file = JSON.parse(exportPrimaryScenario(primaryContractExample('conventional')));
    expect(() => importPrimaryScenario(JSON.stringify({ ...file, exportVersion: 99 })))
      .toThrow(/lê até a 2/);
    expect(() => importPrimaryScenario(JSON.stringify({ ...file, exportVersion: 0 })))
      .toThrow(/não suportada/);
    expect(() => importPrimaryScenario(JSON.stringify({ ...file, exportVersion: undefined })))
      .toThrow(/Versão do arquivo ausente/);
    expect(() => importPrimaryScenario('{')).toThrow(PrimaryScenarioError);
  });

  it('refuses an invalid scenario inside a well formed file', () => {
    const file = JSON.parse(exportPrimaryScenario(primaryContractExample('conventional')));
    file.scenario.primary.stages[0].placements[0].fluidId = 'inexistente';
    expect(() => importPrimaryScenario(JSON.stringify(file))).toThrow(PrimaryScenarioError);
    expect(PRIMARY_EXPORT_KIND).toBe('geopetro-primaria-scenario');
    expect(PRIMARY_EXPORT_VERSION).toBe(2);
  });

  it('adopts an imported scenario as unsaved, without touching the database', () => {
    const service = store({});
    service.adopt('Importado');
    expect(service.saveState().status).toBe('unsaved');
    expect(service.saveState().scenarioId).toBeNull();
    expect(service.saveState().scenarioName).toBe('Importado');
  });
});
