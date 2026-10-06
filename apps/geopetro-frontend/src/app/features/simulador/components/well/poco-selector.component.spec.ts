import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { PocoSelectorComponent } from './poco-selector.component';
import { PocoApiService } from '../../services/poco-api.service';
import { PocoApi, PocoGeometry } from '../../models/poco.model';
import { emptyPhaseForm } from '../../models/well-geometry.form';

function setup() {
  const response = new Subject<PocoApi>();
  const api = { create: vi.fn(() => response), update: vi.fn(() => response), get: vi.fn(() => response) };
  TestBed.configureTestingModule({ providers: [{ provide: PocoApiService, useValue: api }] });
  const fixture = TestBed.createComponent(PocoSelectorComponent);
  const geometry: PocoGeometry = {
    wellFinalMD: 1500, wellFinalTVD: 1500,
    fases: [{ ...emptyPhaseForm(0), bottomMD: 1500, bottomTVD: 1500 }],
    trajectory: { enabled: false, stations: [] },
  };
  fixture.componentRef.setInput('geometry', geometry);
  fixture.detectChanges();
  fixture.componentInstance.nome = 'Poço A';
  const changed = vi.fn();
  fixture.componentInstance.changed.subscribe(changed);
  return { fixture, panel: fixture.componentInstance, api, response, geometry, changed };
}
afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

it('creates a well with canonical metre values and returns its reference', () => {
  const { panel, api, response, geometry, changed } = setup();
  panel.save(false);
  expect(api.create).toHaveBeenCalledWith('Poço A', geometry);
  expect(panel.busy).toBe(true);
  const saved = { id: 7, nome: 'Poço A', version: 0, geometria: geometry, atualizadoPor: 'ana', atualizadoEm: '' };
  response.next(saved); response.complete();
  expect(changed).toHaveBeenCalledWith(saved);
  expect(panel.busy).toBe(false);
});
it('rejects invalid geometry before HTTP and preserves later edits during a pending save', () => {
  const { fixture, panel, api, response, geometry, changed } = setup();
  fixture.componentRef.setInput('geometry', { ...geometry, wellFinalMD: null });
  panel.save(false);
  expect(api.create).not.toHaveBeenCalled();
  expect(panel.error).not.toBe('');
  fixture.componentRef.setInput('geometry', geometry);
  panel.save(false);
  fixture.componentRef.setInput('geometry', { ...geometry, wellFinalMD: 1600 });
  response.next({ id: 7, nome: 'Poço A', version: 0, geometria: geometry, atualizadoPor: 'ana', atualizadoEm: '' });
  response.complete();
  expect(changed).not.toHaveBeenCalled();
  expect(panel.geometry.wellFinalMD).toBe(1600);
  expect(panel.error).toContain('mudou durante o envio');
});
it('preserves the selected well on conflict and shows the server explanation', () => {
  const { fixture, panel, response, geometry, changed } = setup();
  fixture.componentRef.setInput('poco', { id: 7, nome: 'Poço A', version: 0, geometria: geometry });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  panel.save(true);
  response.error({ status: 409, error: { message: 'O poço foi alterado. Recarregue.' } });
  expect(changed).not.toHaveBeenCalled();
  expect(panel.poco?.version).toBe(0);
  expect(panel.error).toContain('Recarregue');
  expect(panel.busy).toBe(false);
});
