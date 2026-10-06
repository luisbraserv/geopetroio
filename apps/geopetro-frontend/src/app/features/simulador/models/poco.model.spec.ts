import { describe, expect, it } from 'vitest';
import { PocoApi, PocoGeometry, scenarioPayload, scenarioForm } from './poco.model';
import { emptyPhaseForm } from './well-geometry.form';

export const geometry: PocoGeometry = {
  wellFinalMD: 1500, wellFinalTVD: 1500,
  fases: [{ ...emptyPhaseForm(0), id: 'p1', bottomMD: 1500, bottomTVD: 1500 }],
  trajectory: { enabled: false, stations: [] },
};
export const poco: PocoApi = { id: 3, nome: 'Poço A', version: 2, geometria: geometry, atualizadoPor: 'ana', atualizadoEm: '' };

describe('well reference and scenario contract', () => {
  it('stores only the reference and operation data without mutating the current form', () => {
    const form = { ...structuredClone(geometry), density: 15.8, _poco: poco };
    const before = structuredClone(form);
    const payload = scenarioPayload(form);
    expect(payload).toEqual({ pocoId: 3, pocoVersion: 2, formValue: '{"density":15.8}' });
    expect(form).toEqual(before);
  });
  it('preserves legacy geometry when no well is linked', () => {
    const form = { ...geometry, density: 15.8 };
    const payload = scenarioPayload(form);
    expect(payload.pocoId).toBeNull();
    expect(JSON.parse(payload.formValue)).toEqual(form);
    expect(scenarioForm({ formValue: payload.formValue })).toEqual({ ...form, _poco: null });
  });
  it('uses current well geometry even if stale copies remain in an old scenario', () => {
    const current = { ...poco, version: 3, geometria: { ...geometry, wellFinalMD: 1600 } };
    const loaded = scenarioForm({ formValue: JSON.stringify({ ...geometry, density: 16 }), poco: current });
    expect(loaded['wellFinalMD']).toBe(1600);
    expect(loaded['density']).toBe(16);
    expect(loaded['_poco']).toBe(current);
  });
  it('blocks unsaved geometry changes before creating or updating a linked scenario', () => {
    expect(() => scenarioPayload({ ...geometry, wellFinalMD: 1700, _poco: poco })).toThrow('Salve as alterações');
  });
  it('rejects malformed scenario data', () => {
    for (const value of ['null', '[]', '123', '{']) expect(() => scenarioForm({ formValue: value })).toThrow();
  });
});
