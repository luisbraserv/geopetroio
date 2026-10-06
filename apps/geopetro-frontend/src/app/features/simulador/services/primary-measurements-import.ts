import { PPG_PER_GCM3 } from '../models/constantes';
import type { PrimaryMeasuredDataset, PrimaryMeasurementChannel } from '../models/primary-measurements.model';
import { PRIMARY_MEASUREMENT_SCHEMA_VERSION } from '../models/primary-measurements.model';
import { parseCsvNumber, type CsvDecimal, type CsvTable } from './primary-csv';

/** 1 bbl = 158.987294928 L, por definição do barril de petróleo. */
const L_PER_BBL = 158.987294928;
const PSI_PER_BAR = 14.503773773;
const PSI_PER_MPA = 145.03773773;
/** 1 ppg = 119.826427 kg/m³. */
const KG_M3_PER_PPG = 119.826427;

export type TimeUnit = 's' | 'min' | 'h' | 'timestamp';
export type RateUnit = 'bpm' | 'L/min' | 'm3/min';
export type PressureUnit = 'psi' | 'bar' | 'MPa';
export type DensityUnit = 'ppg' | 'kg/m3' | 'g/cm3';
export type VolumeUnit = 'bbl' | 'L' | 'm3';
export type MeasurementUnit = RateUnit | PressureUnit | DensityUnit | VolumeUnit;

export interface PrimaryChannelMapping {
  /** Canal canônico de destino. */
  channel: PrimaryMeasurementChannel;
  column: string;
  originalUnit: MeasurementUnit;
  /** Pressão absoluta exige a atmosférica declarada para virar manométrica. */
  absolute?: boolean;
  atmosphericPsi?: number | null;
}

export interface PrimaryImportConfig {
  name: string;
  sourceFileName: string;
  importedAt: string;
  timeColumn: string;
  timeUnit: TimeUnit;
  /** Obrigatório com `timestamp`: sem fuso explícito a data é ambígua. */
  timezone?: string;
  originTimestamp?: string;
  offsetMin: number;
  maxInterpolationGapMin: number | null;
  mappings: PrimaryChannelMapping[];
  /** Ordenação estável só quando o usuário pedir; nunca em silêncio. */
  sortByTime?: boolean;
  maxSamples?: number;
}

export interface PrimaryImportResult {
  dataset: PrimaryMeasuredDataset | null;
  /** Erros que impedem incorporar; a prévia os lista para correção ou descarte. */
  blocking: string[];
  discardedRows: number;
}

const DEFAULT_MAX_SAMPLES = 100_000;

function convert(value: number, unit: MeasurementUnit, mapping: PrimaryChannelMapping): number | null {
  switch (unit) {
    case 'bpm': return value;
    case 'L/min': return value / L_PER_BBL;
    case 'm3/min': return value * 1000 / L_PER_BBL;
    case 'psi': case 'bar': case 'MPa': {
      const psi = unit === 'psi' ? value : unit === 'bar' ? value * PSI_PER_BAR : value * PSI_PER_MPA;
      if (!mapping.absolute) return psi;
      // Absoluta sem atmosférica declarada não vira manométrica por suposição.
      const atmospheric = mapping.atmosphericPsi;
      return atmospheric === null || atmospheric === undefined ? null : psi - atmospheric;
    }
    case 'ppg': return value;
    case 'kg/m3': return value / KG_M3_PER_PPG;
    case 'g/cm3': return value * PPG_PER_GCM3;
    case 'bbl': return value;
    case 'L': return value / L_PER_BBL;
    case 'm3': return value * 1000 / L_PER_BBL;
    default: return null;
  }
}

const UNITS_BY_QUANTITY: Record<string, MeasurementUnit[]> = {
  'pump-rate': ['bpm', 'L/min', 'm3/min'],
  'return-rate': ['bpm', 'L/min', 'm3/min'],
  pressure: ['psi', 'bar', 'MPa'],
  'inlet-density': ['ppg', 'kg/m3', 'g/cm3'],
  'local-density': ['ppg', 'kg/m3', 'g/cm3'],
  ecd: ['ppg', 'kg/m3', 'g/cm3'],
  'total-pumped-volume': ['bbl', 'L', 'm3'],
  'cement-pumped-volume': ['bbl', 'L', 'm3'],
};

/** Unidades compatíveis com a grandeza do canal; outra combinação é erro. */
export function unitsForQuantity(quantity: string): MeasurementUnit[] {
  return UNITS_BY_QUANTITY[quantity] ?? [];
}

function timeInMinutes(raw: string, config: PrimaryImportConfig, decimal: CsvDecimal): number | null {
  if (config.timeUnit === 'timestamp') {
    if (!config.timezone) return null;
    const sample = Date.parse(raw);
    const origin = config.originTimestamp ? Date.parse(config.originTimestamp) : Number.NaN;
    if (!Number.isFinite(sample) || !Number.isFinite(origin)) return null;
    return (sample - origin) / 60000;
  }
  const value = parseCsvNumber(raw, decimal);
  if (value === null) return null;
  return config.timeUnit === 's' ? value / 60 : config.timeUnit === 'h' ? value * 60 : value;
}

/**
 * Normaliza a tabela em um dataset. Não ordena, não imputa, não converte vazio
 * em zero e não aplica o offset: o offset é de apresentação e entra na comparação.
 */
export function importPrimaryMeasurements(table: CsvTable, config: PrimaryImportConfig): PrimaryImportResult {
  const blocking: string[] = [];
  const timeIndex = table.headers.indexOf(config.timeColumn);
  if (timeIndex < 0) blocking.push(`Coluna de tempo "${config.timeColumn}" não existe no arquivo.`);
  if (config.timeUnit === 'timestamp' && !config.timezone)
    blocking.push('Timestamp exige fuso horário declarado; a data seria ambígua.');
  if (config.timeUnit === 'timestamp' && !config.originTimestamp)
    blocking.push('Timestamp exige a origem declarada para virar tempo relativo.');

  const columns = new Map<string, number>();
  const channels: PrimaryMeasurementChannel[] = [];
  const mapping: PrimaryMeasuredDataset['mapping'] = {};
  const ids = new Set<string>();
  for (const entry of config.mappings) {
    const index = table.headers.indexOf(entry.column);
    if (index < 0) { blocking.push(`Coluna "${entry.column}" não existe no arquivo.`); continue; }
    if (ids.has(entry.channel.id)) { blocking.push(`Canal "${entry.channel.id}" mapeado duas vezes.`); continue; }
    const allowed = unitsForQuantity(entry.channel.quantity);
    if (!allowed.includes(entry.originalUnit)) {
      blocking.push(`Unidade "${entry.originalUnit}" é incompatível com ${entry.channel.quantity}.`);
      continue;
    }
    if (entry.channel.quantity === 'pressure' && entry.absolute
      && (entry.atmosphericPsi === null || entry.atmosphericPsi === undefined)) {
      blocking.push(`${entry.channel.id}: pressão absoluta exige a atmosférica declarada.`);
      continue;
    }
    ids.add(entry.channel.id);
    columns.set(entry.channel.id, index);
    channels.push(entry.channel);
    mapping[entry.channel.id] = { column: entry.column, originalUnit: entry.originalUnit };
  }
  if (!channels.length) blocking.push('Informe ao menos um canal além do tempo.');
  if (blocking.length) return { dataset: null, blocking, discardedRows: 0 };

  const importDiagnostics: PrimaryMeasuredDataset['importDiagnostics'] = [];
  const samples: PrimaryMeasuredDataset['samples'] = [];
  let discardedRows = 0;
  for (let i = 0; i < table.rows.length; i++) {
    const sourceRow = i + 2;
    const row = table.rows[i];
    const timeMin = timeInMinutes(row[timeIndex] ?? '', config, table.decimal);
    if (timeMin === null || !Number.isFinite(timeMin)) {
      // Linha sem tempo não entra: o dataset inteiro depende dele.
      importDiagnostics.push({ sourceRow, field: config.timeColumn, rawValue: row[timeIndex] ?? '',
        reason: 'Tempo ausente ou não reconhecido.', resolution: 'discarded-row' });
      discardedRows++;
      continue;
    }
    const values: Record<string, number | null> = {};
    for (const entry of config.mappings) {
      const index = columns.get(entry.channel.id);
      if (index === undefined) continue;
      const raw = row[index] ?? '';
      const parsed = parseCsvNumber(raw, table.decimal);
      if (parsed === null) {
        values[entry.channel.id] = null;
        if (raw.trim())
          importDiagnostics.push({ sourceRow, field: entry.column, rawValue: raw,
            reason: 'Valor não numérico.', resolution: 'missing-value' });
        continue;
      }
      const converted = convert(parsed, entry.originalUnit, entry);
      values[entry.channel.id] = converted;
      if (converted === null)
        importDiagnostics.push({ sourceRow, field: entry.column, rawValue: raw,
          reason: 'Conversão indisponível para a unidade informada.', resolution: 'missing-value' });
    }
    samples.push({ sourceRow, timeMin, values });
  }

  const limit = config.maxSamples ?? DEFAULT_MAX_SAMPLES;
  if (samples.length > limit)
    // Exceder o limite orienta recortar o arquivo; truncar em silêncio, nunca.
    return { dataset: null, discardedRows,
      blocking: [`O arquivo tem ${samples.length} amostras, acima do limite de ${limit}. Recorte o arquivo antes de incorporar.`] };
  if (!samples.length) return { dataset: null, discardedRows, blocking: ['Nenhuma linha com tempo válido.'] };

  const ordered = config.sortByTime
    ? [...samples].sort((a, b) => a.timeMin - b.timeMin || a.sourceRow - b.sourceRow)
    : samples;
  return {
    dataset: {
      id: `${config.sourceFileName}-${config.importedAt}`,
      schemaVersion: PRIMARY_MEASUREMENT_SCHEMA_VERSION,
      name: config.name, importedAt: config.importedAt, sourceFileName: config.sourceFileName,
      mapping,
      alignment: { offsetMin: config.offsetMin,
        ...(config.originTimestamp ? { originTimestamp: config.originTimestamp } : {}),
        ...(config.timezone ? { timezone: config.timezone } : {}) },
      maxInterpolationGapMin: config.maxInterpolationGapMin ?? suggestGapLimit(ordered.map(s => s.timeMin)),
      channels, samples: ordered, importDiagnostics,
    },
    blocking: [], discardedRows,
  };
}

/** Sugestão inicial: três vezes a mediana dos intervalos positivos. */
export function suggestGapLimit(times: number[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const delta = times[i] - times[i - 1];
    if (delta > 0) deltas.push(delta);
  }
  if (!deltas.length) return 0;
  deltas.sort((a, b) => a - b);
  const middle = Math.floor(deltas.length / 2);
  const median = deltas.length % 2 ? deltas[middle] : (deltas[middle - 1] + deltas[middle]) / 2;
  return 3 * median;
}

/** Amostras fora de ordem existem; a prévia avisa em vez de ordenar sozinha. */
export function hasOutOfOrderSamples(samples: { timeMin: number }[]): boolean {
  return samples.some((sample, index) => index > 0 && sample.timeMin < samples[index - 1].timeMin);
}
