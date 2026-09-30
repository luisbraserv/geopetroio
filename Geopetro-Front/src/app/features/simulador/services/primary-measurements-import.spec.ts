import { describe, expect, it } from 'vitest';
import type { PrimaryMeasurementChannel } from '../models/primary-measurements.model';
import { detectDelimiter, parseCsv, parseCsvNumber } from './primary-csv';
import { hasOutOfOrderSamples, importPrimaryMeasurements, suggestGapLimit,
  unitsForQuantity, type PrimaryImportConfig } from './primary-measurements-import';

const returnChannel: PrimaryMeasurementChannel = { id: 'retorno', name: 'Retorno',
  location: 'Saída anular', quantity: 'return-rate', unit: 'bpm' };
const pressureChannel: PrimaryMeasurementChannel = { id: 'pressao', name: 'Pressão',
  location: 'Cabeça', quantity: 'pressure', unit: 'psi' };

function config(overrides: Partial<PrimaryImportConfig> = {}): PrimaryImportConfig {
  return {
    name: 'Operação', sourceFileName: 'operacao.csv', importedAt: '2026-09-18T12:00:00Z',
    timeColumn: 'tempo', timeUnit: 'min', offsetMin: 0, maxInterpolationGapMin: null,
    mappings: [{ channel: returnChannel, column: 'retorno', originalUnit: 'bpm' }],
    ...overrides,
  };
}

describe('measured data import (P8)', () => {
  it('reads a semicolon file with decimal comma without splitting on the comma', () => {
    const text = 'tempo;retorno\n0;3,5\n1;4,25\n';
    expect(detectDelimiter(text, ',')).toBe(';');
    const table = parseCsv(text, { decimal: ',' });
    expect(table.headers).toEqual(['tempo', 'retorno']);
    expect(table.rows).toEqual([['0', '3,5'], ['1', '4,25']]);
    expect(parseCsvNumber('3,5', ',')).toBe(3.5);
    expect(parseCsvNumber('1.234,5', ',')).toBe(1234.5);
    expect(parseCsvNumber('1,234.5', '.')).toBe(1234.5);
  });

  it('keeps quoted text as text and never as a formula', () => {
    const table = parseCsv('tempo,nota\n0,"=SOMA(A1;A2)"\n1,"diz ""ok"""\n');
    expect(table.rows[0][1]).toBe('=SOMA(A1;A2)');
    expect(table.rows[1][1]).toBe('diz "ok"');
    expect(parseCsvNumber('=SOMA(A1)', '.')).toBeNull();
  });

  it('never turns an empty cell into zero', () => {
    const table = parseCsv('tempo,retorno\n0,3\n1,\n2,x\n');
    const result = importPrimaryMeasurements(table, config());
    expect(result.dataset!.samples.map(s => s.values['retorno'])).toEqual([3, null, null]);
    // Só o valor não numérico vira diagnóstico; a célula vazia é ausência.
    expect(result.dataset!.importDiagnostics).toHaveLength(1);
    expect(result.dataset!.importDiagnostics[0].sourceRow).toBe(4);
    expect(result.dataset!.importDiagnostics[0].rawValue).toBe('x');
  });

  it('converts units into the canonical ones', () => {
    const table = parseCsv('tempo,retorno\n0,158.987294928\n');
    const litres = importPrimaryMeasurements(table,
      config({ mappings: [{ channel: returnChannel, column: 'retorno', originalUnit: 'L/min' }] }));
    expect(litres.dataset!.samples[0].values['retorno']).toBeCloseTo(1, 12);
    expect(litres.dataset!.mapping['retorno'].originalUnit).toBe('L/min');

    const bar = importPrimaryMeasurements(parseCsv('tempo,p\n0,10\n'),
      config({ mappings: [{ channel: pressureChannel, column: 'p', originalUnit: 'bar' }] }));
    expect(bar.dataset!.samples[0].values['pressao']).toBeCloseTo(145.03773773, 8);
  });

  it('refuses absolute pressure without a declared atmospheric value', () => {
    const table = parseCsv('tempo,p\n0,114.7\n');
    const missing = importPrimaryMeasurements(table, config({
      mappings: [{ channel: pressureChannel, column: 'p', originalUnit: 'psi', absolute: true }] }));
    expect(missing.dataset).toBeNull();
    expect(missing.blocking[0]).toContain('atmosférica');

    const declared = importPrimaryMeasurements(table, config({
      mappings: [{ channel: pressureChannel, column: 'p', originalUnit: 'psi',
        absolute: true, atmosphericPsi: 14.7 }] }));
    expect(declared.dataset!.samples[0].values['pressao']).toBeCloseTo(100, 8);
  });

  it('rejects a unit that does not belong to the quantity', () => {
    const result = importPrimaryMeasurements(parseCsv('tempo,retorno\n0,3\n'), config({
      mappings: [{ channel: returnChannel, column: 'retorno', originalUnit: 'psi' }] }));
    expect(result.dataset).toBeNull();
    expect(result.blocking[0]).toContain('incompatível');
    expect(unitsForQuantity('return-rate')).toEqual(['bpm', 'L/min', 'm3/min']);
  });

  it('discards rows without time and reports each one', () => {
    const table = parseCsv('tempo,retorno\n0,3\n,4\n2,5\n');
    const result = importPrimaryMeasurements(table, config());
    expect(result.discardedRows).toBe(1);
    expect(result.dataset!.samples.map(s => s.timeMin)).toEqual([0, 2]);
    const discarded = result.dataset!.importDiagnostics.find(d => d.resolution === 'discarded-row')!;
    expect(discarded.sourceRow).toBe(3);
  });

  it('converts relative time units and demands a timezone for timestamps', () => {
    const seconds = importPrimaryMeasurements(parseCsv('tempo,retorno\n120,3\n'),
      config({ timeUnit: 's' }));
    expect(seconds.dataset!.samples[0].timeMin).toBe(2);

    const ambiguous = importPrimaryMeasurements(parseCsv('tempo,retorno\n2026-09-18T12:00:00Z,3\n'),
      config({ timeUnit: 'timestamp' }));
    expect(ambiguous.dataset).toBeNull();
    expect(ambiguous.blocking.join(' ')).toContain('fuso');

    const declared = importPrimaryMeasurements(parseCsv('tempo,retorno\n2026-09-18T12:05:00Z,3\n'),
      config({ timeUnit: 'timestamp', timezone: 'UTC', originTimestamp: '2026-09-18T12:00:00Z' }));
    expect(declared.dataset!.samples[0].timeMin).toBeCloseTo(5, 9);
  });

  it('preserves order, repeated times and steps unless sorting is asked for', () => {
    const table = parseCsv('tempo,retorno\n2,3\n1,4\n1,5\n');
    const kept = importPrimaryMeasurements(table, config());
    expect(kept.dataset!.samples.map(s => s.timeMin)).toEqual([2, 1, 1]);
    expect(hasOutOfOrderSamples(kept.dataset!.samples)).toBe(true);
    const sorted = importPrimaryMeasurements(table, config({ sortByTime: true }));
    // Ordenação estável: o tempo repetido mantém a ordem original do arquivo.
    expect(sorted.dataset!.samples.map(s => s.sourceRow)).toEqual([3, 4, 2]);
  });

  it('does not store the offset in the samples, only in the alignment', () => {
    const result = importPrimaryMeasurements(parseCsv('tempo,retorno\n0,3\n5,4\n'),
      config({ offsetMin: 7 }));
    expect(result.dataset!.samples.map(s => s.timeMin)).toEqual([0, 5]);
    expect(result.dataset!.alignment.offsetMin).toBe(7);
  });

  it('suggests the gap limit as three times the median spacing', () => {
    expect(suggestGapLimit([0, 1, 2, 3])).toBe(3);
    expect(suggestGapLimit([0, 1, 5, 6])).toBe(3);
    expect(suggestGapLimit([])).toBe(0);
    const result = importPrimaryMeasurements(parseCsv('tempo,retorno\n0,1\n2,1\n4,1\n'), config());
    expect(result.dataset!.maxInterpolationGapMin).toBe(6);
  });

  it('refuses to truncate a file above the sample limit', () => {
    const rows = Array.from({ length: 5 }, (_, i) => `${i},1`).join('\n');
    const result = importPrimaryMeasurements(parseCsv(`tempo,retorno\n${rows}\n`),
      config({ maxSamples: 3 }));
    expect(result.dataset).toBeNull();
    expect(result.blocking[0]).toContain('Recorte o arquivo');
  });
});
