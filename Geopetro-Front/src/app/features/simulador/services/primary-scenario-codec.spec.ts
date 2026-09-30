import { describe, expect, it } from 'vitest';
import { primaryContractExample } from '../models/primary-cementing.examples';
import { defaultPreflushQuantity } from '../models/primary-cementing.model';
import { createPrimaryDraft } from '../models/primary-scenario.model';
import type { PrimaryMeasuredDataset } from '../models/primary-measurements.model';
import type { PocoApi } from '../models/poco.model';
import { pocoGeometryFromForm } from '../models/poco.model';
import { parsePrimaryScenario, primaryScenarioFromApi, primaryScenarioPayload,
  serializePrimaryScenario, validatePrimaryScenario } from './primary-scenario-codec';

function measured(): PrimaryMeasuredDataset {
  return {
    id: 'return-log', schemaVersion: 1, name: 'Retorno medido', importedAt: '2026-09-17T12:00:00Z',
    sourceFileName: 'operacao.csv', mapping: { return: { column: 'retorno', originalUnit: 'L/min' } },
    alignment: { offsetMin: 5 }, maxInterpolationGapMin: 3,
    channels: [{ id: 'return', name: 'Retorno', location: 'Saída anular', quantity: 'return-rate', unit: 'bpm' }],
    samples: [
      { sourceRow: 2, timeMin: 2, values: { return: 3 } },
      { sourceRow: 3, timeMin: 2, values: { return: null } },
      { sourceRow: 4, timeMin: 3, values: { return: 0 } },
    ], importDiagnostics: [],
  };
}

describe('primary scenario P1 contracts', () => {
  it.each(['conventional', 'liner', 'two-stage'] as const)('round-trips %s without inventing a calculated result', kind => {
    const original = primaryContractExample(kind);
    const restored = parsePrimaryScenario(serializePrimaryScenario(original));
    expect(restored).toEqual(original);
    expect(restored.engineVersion).toBeNull();
    expect(restored.status).toBe('draft');
    expect(restored).not.toHaveProperty('results');
  });

  it('keeps independent empty drafts serializable without treating them as physical solutions', () => {
    const first = createPrimaryDraft();
    first.presentation.snapshotTimesMin.push(2);
    expect(createPrimaryDraft().presentation.snapshotTimesMin).toEqual([]);
    expect(parsePrimaryScenario(serializePrimaryScenario(first)).primary.target).toBeNull();
  });

  it('preserves incomplete survey fields in a draft for later geometry validation', () => {
    const s = createPrimaryDraft();
    s.trajectory = { enabled: true, stations: [{ md: 0, inclinationDeg: null, azimuthDeg: null }] };
    expect(parsePrimaryScenario(serializePrimaryScenario(s)).trajectory).toEqual(s.trajectory);
  });

  it('preserves pump order, pauses, repeated fluids and split placement quantities', () => {
    const scenario = primaryContractExample('conventional');
    const stage = scenario.primary.stages[0];
    stage.steps = [
      { id: 'pause', kind: 'pause', durationMin: 5 },
      { id: 'half-1', kind: 'pump', fluidId: 'cement', rateBpm: 2,
        quantity: { source: 'placement', placementId: 'cement-1', fraction: 0.4 } },
      { id: 'wash', kind: 'pump', fluidId: 'mud', rateBpm: 4, quantity: { source: 'entered', volumeBbl: 10 } },
      { id: 'half-2', kind: 'pump', fluidId: 'cement', rateBpm: 3,
        quantity: { source: 'placement', placementId: 'cement-1', fraction: 0.6 } },
    ];
    expect(parsePrimaryScenario(serializePrimaryScenario(scenario)).primary.stages[0].steps).toEqual(stage.steps);
  });

  it('preserves overrides, measured gaps, repeated times, original units and unapplied time offset', () => {
    const s = primaryContractExample('liner');
    s.measurements = [measured()];
    s.primary.fluids[1].propertySources.densityPpg = {
      source: 'measured', reference: 'Lab A', originalValue: 1.92, originalUnit: 'g/cm³', temperatureC: 25,
    };
    s.presentation.volumeAxis = 'cement-pumped';
    const restored = parsePrimaryScenario(serializePrimaryScenario(s));
    expect(restored).toEqual(s);
    expect(restored.measurements[0].samples.map(row => row.timeMin)).toEqual([2, 2, 3]);
    expect(restored.measurements[0].samples.map(row => row.values['return'])).toEqual([3, null, 0]);
  });

  it('fits the existing linked-well API and reloads data without duplicate shared geometry', () => {
    const s = primaryContractExample('two-stage');
    s.measurements = [measured()];
    const before = structuredClone(s);
    const poco: PocoApi = { id: 12, nome: 'Poço', version: 3, atualizadoPor: 'tester', atualizadoEm: '',
      geometria: pocoGeometryFromForm(s) };
    const payload = primaryScenarioPayload(s, poco);
    const stored = JSON.parse(payload.formValue);
    expect(payload.operacao).toBe('primaria');
    expect(payload.pocoId).toBe(12);
    expect(payload.pocoVersion).toBe(3);
    for (const key of ['wellFinalMD', 'wellFinalTVD', 'fases', 'trajectory', '_poco']) expect(stored).not.toHaveProperty(key);
    expect(primaryScenarioFromApi({ ...payload, poco })).toEqual(s);
    expect(s).toEqual(before);
  });

  it('does not trust a persisted validated status after hydration', () => {
    const s = primaryContractExample('conventional');
    s.status = 'validated';
    const payload = primaryScenarioPayload(s);
    expect(primaryScenarioFromApi(payload).status).toBe('draft');
  });

  it('blocks unsaved well geometry and references removed from the current well', () => {
    const s = primaryContractExample('conventional');
    const poco: PocoApi = { id: 12, nome: 'Poço', version: 3, atualizadoPor: '', atualizadoEm: '',
      geometria: pocoGeometryFromForm(s) };
    const payload = primaryScenarioPayload(s, poco);
    s.wellFinalMD = 1700;
    expect(() => primaryScenarioPayload(s, poco)).toThrow('Salve as alterações');
    const changed = { ...poco, version: 4, geometria: { ...poco.geometria, fases: [] } };
    expect(() => primaryScenarioFromApi({ ...payload, poco: changed })).toThrow('Referência inexistente: open');
  });

  it.each(['{', 'null', '[]', '123'])('rejects invalid input %s', json => {
    expect(() => parsePrimaryScenario(json)).toThrow();
  });
  it('rejects another operation, future schema and nested future dataset schema', () => {
    const s = primaryContractExample('conventional');
    expect(() => parsePrimaryScenario(JSON.stringify({ ...s, operation: 'squeeze' }))).toThrow('não é de cimentação primária');
    expect(() => parsePrimaryScenario(JSON.stringify({ ...s, schemaVersion: 99 }))).toThrow('Versão');
    expect(() => parsePrimaryScenario(JSON.stringify({ ...s, measurements: [{ ...measured(), schemaVersion: 2 }] }))).toThrow('schemaVersion');
    expect(() => primaryScenarioFromApi({ ...primaryScenarioPayload(s), operacao: 'squeeze' })).toThrow('incompatível');
  });
  it.each([NaN, Infinity, -Infinity])('rejects non-finite values before JSON can replace %s with null', value => {
    const s = primaryContractExample('conventional');
    s.primary.fluids[0].densityPpg = value;
    expect(() => serializePrimaryScenario(s)).toThrow('Número finito');
  });
  it('rejects duplicate IDs and dangling references rather than selecting an arbitrary object', () => {
    const s = primaryContractExample('conventional');
    s.primary.fluids.push({ ...s.primary.fluids[0] });
    expect(() => validatePrimaryScenario(s)).toThrow('ID duplicado');
    s.primary.fluids.pop();
    s.primary.stages[0].activePathId = 'missing';
    expect(() => validatePrimaryScenario(s)).toThrow('Referência inexistente');
  });
  it('rejects a placement from another stage and a mismatched fluid', () => {
    const s = primaryContractExample('two-stage');
    const pump = s.primary.stages[0].steps[0];
    if (pump.kind !== 'pump' || pump.quantity.source !== 'placement') throw Error('fixture');
    pump.quantity.placementId = 'cement-2';
    expect(() => validatePrimaryScenario(s)).toThrow('Referência inexistente');
    pump.quantity.placementId = 'cement-1';
    pump.fluidId = 'mud';
    expect(() => validatePrimaryScenario(s)).toThrow('Fluido diferente');
  });
  it('does not allow manual cement volume to bypass TOC sizing', () => {
    const s = primaryContractExample('conventional');
    const pump = s.primary.stages[0].steps[0];
    if (pump.kind !== 'pump') throw Error('fixture');
    pump.quantity = { source: 'entered', volumeBbl: 30 };
    expect(() => validatePrimaryScenario(s)).toThrow('colocação ou reserva');
    pump.quantity = { source: 'reserve-extra', placementId: 'cement-1', volumeBbl: 3 };
    expect(() => validatePrimaryScenario(s)).not.toThrow();
  });
  it('round-trips a preflush calculated by the simulator, with and without the informed volume', () => {
    const s = primaryContractExample('conventional');
    const cement = s.primary.fluids.find(f => f.kind === 'cement')!;
    const { recipe: _recipe, recipeParameters: _parameters, labCurves: _curves, ...base } = cement;
    s.primary.fluids.push({ ...base, id: 'spacer-x', kind: 'spacer', name: 'Espaçador' });
    s.primary.stages[0].steps.unshift(
      { id: 'spacer-calc', kind: 'pump', fluidId: 'spacer-x', rateBpm: 5, quantity: defaultPreflushQuantity('spacer') },
      { id: 'spacer-informed', kind: 'pump', fluidId: 'spacer-x', rateBpm: 5,
        quantity: { ...defaultPreflushQuantity('spacer'), overrideBbl: 12.5 } });
    const restored = parsePrimaryScenario(serializePrimaryScenario(s));
    expect(restored.primary.stages[0].steps.slice(0, 2)).toEqual(s.primary.stages[0].steps.slice(0, 2));
    // Pasta nunca tem volume de colchão.
    const pump = s.primary.stages[0].steps.find(step => step.kind === 'pump' && step.fluidId === cement.id)!;
    if (pump.kind !== 'pump') throw Error('fixture');
    pump.quantity = defaultPreflushQuantity('spacer');
    expect(() => validatePrimaryScenario(s)).toThrow('lavador e espaçador');
  });

  it('round-trips the mixing reserve and still loads a placement saved without it', () => {
    const s = primaryContractExample('conventional');
    s.primary.stages[0].placements[0].mixingReserveBbl = 8.5;
    const restored = parsePrimaryScenario(serializePrimaryScenario(s));
    expect(restored.primary.stages[0].placements[0].mixingReserveBbl).toBe(8.5);
    // Cenário anterior ao campo continua válido; ausência não vira zero implícito no contrato.
    const legacy = primaryContractExample('conventional');
    expect(() => validatePrimaryScenario(legacy)).not.toThrow();
    expect(legacy.primary.stages[0].placements[0].mixingReserveBbl).toBeUndefined();
    const invalid = JSON.parse(JSON.stringify(s));
    invalid.primary.stages[0].placements[0].mixingReserveBbl = 'muita';
    expect(() => validatePrimaryScenario(invalid)).toThrow('Número finito');
  });
  it('rejects a measured diameter with an extra excess field', () => {
    const s = primaryContractExample('conventional');
    const raw = JSON.parse(JSON.stringify(s));
    raw.primary.outerBoundaries[1].diameter = { source: 'measured', diameterIn: 9, excessFraction: 0.2 };
    expect(() => validatePrimaryScenario(raw)).toThrow('Campo desconhecido');
  });
  it('rejects inconsistent measurement units and unknown channels', () => {
    const s = primaryContractExample('conventional');
    s.measurements = [measured()];
    const raw = JSON.parse(JSON.stringify(s));
    raw.measurements[0].channels[0].unit = 'psi';
    expect(() => validatePrimaryScenario(raw)).toThrow('unit');
    s.measurements[0].samples[0].values['missing'] = 1;
    expect(() => validatePrimaryScenario(s)).toThrow('Referência inexistente');
  });
});
