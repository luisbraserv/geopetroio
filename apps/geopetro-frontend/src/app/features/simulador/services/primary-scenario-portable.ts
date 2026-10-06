import { createPrimaryReportData, parsePrimaryReportData, type PrimaryReportData } from '../models/primary-report-data.model';
import type { PrimaryScenario } from '../models/primary-scenario.model';
import { PrimaryScenarioError, validatePrimaryScenario, migratePrimaryScenario } from './primary-scenario-codec';

/**
 * JSON portátil do cenário. Carrega a geometria **completa** como snapshot, não
 * o formato vinculado ao poço: um arquivo precisa abrir em outra instalação, onde
 * aquele `pocoId` não existe. IDs de banco viajam apenas como procedência.
 */
export const PRIMARY_EXPORT_KIND = 'geopetro-primaria-scenario' as const;
export const PRIMARY_EXPORT_VERSION = 2 as const;

export interface PrimaryExportProvenance {
  scenarioId?: number | null;
  scenarioName?: string | null;
  pocoId?: number | null;
  pocoVersion?: number | null;
  pocoNome?: string | null;
  pastaId?: number | null;
}

export interface PrimaryScenarioFile {
  kind: typeof PRIMARY_EXPORT_KIND;
  exportVersion: number;
  exportedAt: string;
  provenance: PrimaryExportProvenance;
  scenario: PrimaryScenario;
  dadosRelatorio: PrimaryReportData;
}

export interface PrimaryImportSummary {
  name: string | null;
  stages: number;
  fluids: number;
  steps: number;
  measurements: number;
  samples: number;
  references: number;
  /** Procedência do arquivo; nada disso vincula o cenário importado. */
  provenance: PrimaryExportProvenance;
}

export function summarizePrimaryScenario(scenario: PrimaryScenario,
  provenance: PrimaryExportProvenance = {}): PrimaryImportSummary {
  return {
    name: provenance.scenarioName ?? null,
    stages: scenario.primary.stages.length,
    fluids: scenario.primary.fluids.length,
    steps: scenario.primary.stages.reduce((sum, stage) => sum + stage.steps.length, 0),
    measurements: scenario.measurements.length,
    samples: scenario.measurements.reduce((sum, dataset) => sum + dataset.samples.length, 0),
    references: scenario.presentation.references.length,
    provenance,
  };
}

export function exportPrimaryScenario(scenario: PrimaryScenario,
  provenance: PrimaryExportProvenance = {}, exportedAt = new Date().toISOString(),
  dadosRelatorio: PrimaryReportData = createPrimaryReportData()): string {
  // Validar antes de serializar: um cenário quebrado não vira arquivo.
  validatePrimaryScenario(scenario);
  const file: PrimaryScenarioFile = {
    kind: PRIMARY_EXPORT_KIND, exportVersion: PRIMARY_EXPORT_VERSION, exportedAt,
    provenance, scenario, dadosRelatorio: parsePrimaryReportData(dadosRelatorio),
  };
  return JSON.stringify(file);
}

export interface PrimaryImportResult {
  dadosRelatorio: PrimaryReportData;
  scenario: PrimaryScenario;
  summary: PrimaryImportSummary;
}

/**
 * Lê o arquivo e devolve um cenário **novo e editável**. Não salva no banco, não
 * vincula ao poço de origem e não sobrescreve o que estiver aberto: quem chama
 * decide o que fazer com o resultado.
 */
export function importPrimaryScenario(json: string): PrimaryImportResult {
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new PrimaryScenarioError('json', 'arquivo', 'JSON inválido.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PrimaryScenarioError('structure', 'arquivo', 'Objeto obrigatório.');
  const file = value as Partial<PrimaryScenarioFile>;
  if (file.kind !== PRIMARY_EXPORT_KIND)
    throw new PrimaryScenarioError('operation', 'kind',
      'O arquivo não é um cenário de cimentação primária. Importar squeeze não o converte.');
  if (typeof file.exportVersion !== 'number' || !Number.isInteger(file.exportVersion))
    throw new PrimaryScenarioError('version', 'exportVersion', 'Versão do arquivo ausente.');
  if (file.exportVersion > PRIMARY_EXPORT_VERSION)
    throw new PrimaryScenarioError('version', 'exportVersion',
      `Arquivo na versão ${file.exportVersion}; esta instalação lê até a ${PRIMARY_EXPORT_VERSION}.`);
  if (file.exportVersion < 1)
    throw new PrimaryScenarioError('version', 'exportVersion', 'Versão do arquivo não suportada.');
  const scenario = migratePrimaryScenario(file.scenario);
  const provenance = validateProvenance(file.provenance);
  return {
    // Cenário importado nasce rascunho: nenhum status salvo certifica o que mudou.
    scenario: { ...scenario, status: 'draft' },
    dadosRelatorio: parsePrimaryReportData(file.dadosRelatorio),
    summary: summarizePrimaryScenario(scenario, provenance),
  };
}

function validateProvenance(value: unknown): PrimaryExportProvenance {
  if (value == null) return {};
  const fail = (): never => { throw new PrimaryScenarioError('structure', 'provenance', 'Procedência do arquivo inválida.'); };
  if (typeof value !== 'object' || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  const result: Record<string, string | number | null> = {};
  for (const key of ['scenarioId', 'pocoId', 'pocoVersion', 'pastaId']) {
    if (row[key] === undefined) continue;
    if (row[key] !== null && (typeof row[key] !== 'number' || !Number.isSafeInteger(row[key]) || (row[key] as number) < 0)) return fail();
    result[key] = row[key] as number | null;
  }
  for (const key of ['scenarioName', 'pocoNome']) {
    if (row[key] === undefined) continue;
    if (row[key] !== null && typeof row[key] !== 'string') return fail();
    result[key] = row[key] as string | null;
  }
  return result;
}
