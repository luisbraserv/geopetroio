import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SimuladorPrimariaComponent } from './simulador-primaria.component';

afterEach(() => TestBed.resetTestingModule());

function create(): ComponentFixture<SimuladorPrimariaComponent> {
  const fixture = TestBed.createComponent(SimuladorPrimariaComponent);
  fixture.componentInstance.selectOperationPhase('open');
  fixture.componentInstance.secPumpingOpen = true;
  fixture.detectChanges();
  return fixture;
}

describe('primary non-cement fluid rheology editor', () => {
  it('renders n and k for every non-cement fluid and persists valid edits in the component state', () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;
    const cards = [...root.querySelectorAll<HTMLElement>('.pr-fluid-card')];
    const component = fixture.componentInstance;

    expect(cards.map(card => card.dataset['fluidId'])).toEqual(['mud', 'spacer', 'displacement']);
    expect(cards.every(card => card.querySelectorAll('[data-rheology-field]').length === 2)).toBe(true);
    // Programa novo: n e k de referência do R3 §12-7, identificados como estimativa.
    expect(root.textContent).toContain('Reologia de referência (R3 §12-7');
    expect(root.textContent).not.toContain('Estimativa simplificada de água a 1 cP');
    const reference = component.form().fluids.find(fluid => fluid.id === 'spacer')!;
    expect(reference.rheology.n).toBeCloseTo(0.24834176807333225, 12);
    expect(reference.propertySources.n?.source).toBe('estimated');

    const spacer = root.querySelector<HTMLElement>('.pr-fluid-card[data-fluid-id="spacer"]')!;
    const n = spacer.querySelector<HTMLInputElement>('[data-rheology-field="n"]')!;
    const k = spacer.querySelector<HTMLInputElement>('[data-rheology-field="kLbfSnFt2"]')!;
    n.value = '0.72';
    n.dispatchEvent(new Event('input'));
    k.value = '0.0017';
    k.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const edited = component.form().fluids.find(fluid => fluid.id === 'spacer')!;
    expect(edited.rheology).toEqual({ model: 'power-law', n: 0.72, kLbfSnFt2: 0.0017 });
    expect(edited.propertySources.n?.source).toBe('entered');
    expect(edited.propertySources.kLbfSnFt2?.source).toBe('entered');
    expect(spacer.textContent).toContain('n informada');
    expect(spacer.textContent).toContain('k informada');
    expect(spacer.textContent).not.toContain('Reologia de referência');

    component.setFluidDensity('spacer', '11.5');
    fixture.detectChanges();
    expect(component.form().fluids.find(fluid => fluid.id === 'spacer')!.rheology)
      .toEqual({ model: 'power-law', n: 0.72, kLbfSnFt2: 0.0017 });
  });

  it('rejects zero, negative and non-numeric rheology values', () => {
    const component = create().componentInstance;
    const before = component.form().fluids.find(fluid => fluid.id === 'mud')!;

    component.setFluidRheology('mud', 'n', '0');
    component.setFluidRheology('mud', 'kLbfSnFt2', '-0.001');
    component.setFluidRheology('mud', 'n', 'invalid');

    const after = component.form().fluids.find(fluid => fluid.id === 'mud')!;
    expect(after.rheology).toEqual(before.rheology);
    expect(after.propertySources.n?.source).toBe('estimated');
    expect(after.propertySources.kLbfSnFt2?.source).toBe('estimated');
  });

  it('recalculates the hydraulic chart immediately when rheology of an active fluid changes', () => {
    const fixture = create();
    const component = fixture.componentInstance;
    const beforeCharts = component.operationCharts();
    // O ECD aparece também parado (igual à ESD); a reologia só pesa em circulação.
    const before = beforeCharts?.references[0].points.find(point => point.circulating && point.ecdPpg !== null);
    expect(before).toBeTruthy();

    const root = fixture.nativeElement as HTMLElement;
    const mud = root.querySelector<HTMLElement>('.pr-fluid-card[data-fluid-id="mud"]')!;
    const n = mud.querySelector<HTMLInputElement>('[data-rheology-field="n"]')!;
    n.value = '0.65';
    n.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const afterCharts = component.operationCharts();
    const after = afterCharts?.references[0].points.find(point => point.volumeBbl === before!.volumeBbl
      && point.circulating && point.ecdPpg !== null);
    expect(afterCharts).not.toBe(beforeCharts);
    expect(component.form().fluids.find(fluid => fluid.id === 'mud')!.rheology.n).toBe(0.65);
    expect(after?.annularFrictionPsi).not.toBeCloseTo(before!.annularFrictionPsi!, 9);
    expect(after?.ecdPpg).not.toBeCloseTo(before!.ecdPpg!, 9);
  });

  it('recalculates pipe and annular friction when their levels change', () => {
    const fixture = create();
    const component = fixture.componentInstance;
    component.setText('internalFrictionLevel', 'low');
    component.setText('annularFrictionLevel', 'low');
    const low = component.hydraulics()!.points.find(point => point.state === 'full' && point.pumpRateBpm > 0)!;

    component.setText('internalFrictionLevel', 'high');
    component.setText('annularFrictionLevel', 'high');
    const high = component.hydraulics()!.points.find(point => point.state === 'full' && point.pumpRateBpm > 0)!;

    expect(high.pipeFrictionPsi).toBeCloseTo(low.pipeFrictionPsi! * 1.35, 9);
    expect(high.annularFrictionPsi).toBeCloseTo(low.annularFrictionPsi! * 1.35, 9);
    expect(high.ecdPpg).toBeGreaterThan(low.ecdPpg!);
  });
});
