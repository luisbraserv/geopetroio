import { ChangeDetectorRef } from '@angular/core';
import { afterEach, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { SimuladorStateModalComponent } from './simulador-state-modal.component';
import { CenarioApi, SimuladorStateApiService } from '../../services/simulador-state-api.service';
import { ToastService } from '../../../../shared/toast/toast.service';
import { PocoApi } from '../../models/poco.model';

afterEach(() => vi.restoreAllMocks());
it('fetches the scenario again when loading and emits the current shared geometry', () => {
  const response = new Subject<CenarioApi>();
  const api = { buscarCenario: vi.fn(() => response) };
  const modal = new SimuladorStateModalComponent(api as unknown as SimuladorStateApiService,
    { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef,
    { success: vi.fn(), error: vi.fn() } as unknown as ToastService);
  const loaded = vi.fn();
  modal.carregar$.subscribe(loaded);
  modal.carregar({ id: 9, formValue: '{"wellFinalMD":500}' } as CenarioApi);
  expect(api.buscarCenario).toHaveBeenCalledWith(9);
  expect(loaded).not.toHaveBeenCalled();
  const poco = { id: 3, nome: 'Atual', version: 4, geometria: {
    wellFinalMD: 1600, wellFinalTVD: 1500, fases: [], trajectory: { enabled: false, stations: [] },
  } } as unknown as PocoApi;
  response.next({ id: 9, poco, formValue: '{"density":15.8}' } as CenarioApi);
  response.complete();
  expect(loaded).toHaveBeenCalledWith(expect.objectContaining({ wellFinalMD: 1600, density: 15.8, _poco: poco }));
  expect(modal.busyId).toBeNull();
});

it('cancels a pending load when the modal closes without replacing page data', () => {
  const response = new Subject<CenarioApi>();
  const api = { buscarCenario: vi.fn(() => response) };
  const modal = new SimuladorStateModalComponent(api as unknown as SimuladorStateApiService,
    { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef,
    { success: vi.fn(), error: vi.fn() } as unknown as ToastService);
  const loaded = vi.fn();
  modal.carregar$.subscribe(loaded);
  modal.carregar({ id: 9 } as CenarioApi);
  modal.fechar();
  response.next({ id: 9, formValue: '{}' } as CenarioApi);
  expect(loaded).not.toHaveBeenCalled();
  expect(modal.busyId).toBeNull();
});
