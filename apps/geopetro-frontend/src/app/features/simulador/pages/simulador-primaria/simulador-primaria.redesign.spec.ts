import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SimuladorPrimariaComponent } from './simulador-primaria.component';

afterEach(() => TestBed.resetTestingModule());

function create(): { fixture: ComponentFixture<SimuladorPrimariaComponent>;
  component: SimuladorPrimariaComponent } {
  const fixture = TestBed.createComponent(SimuladorPrimariaComponent);
  fixture.componentInstance.selectOperationPhase('open');
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance };
}

/**
 * T7: as invariantes de §6 da SPEC do redesenho, conferidas **depois** de a tela
 * ter mudado de layout. Elas vieram de P7 a P12 e não podem se perder no caminho.
 */
describe('redesign regression: what the new screen must not undo (T7)', () => {
  it('P7 — changing an input pauses playback and invalidates the result', () => {
    const { component } = create();
    component.selectedTimeMin.set(4);
    component.playing.set(true);
    component.phaseForms.at(1).patchValue({ bottomMD: 1550, bottomTVD: 1550, shoeMD: 1550, shoeTVD: 1550 });
    component.onPhaseEdit();
    expect(component.playing()).toBe(false);
    expect(component.selectedTimeMin()).toBe(0);
    expect(component.form().shoeMD).toBe(1550);
  });

  it('P7 — moving the cursor does not run the engine again', () => {
    const { component } = create();
    const before = component.result();
    component.onCursor(String(component.totalTimeMin() / 2));
    component.nextEvent();
    component.previousEvent();
    expect(component.result()).toBe(before);
  });

  it('P7 — cement is drawn outside the casing, never inside it', () => {
    const { component } = create();
    component.onCursor(String(component.totalTimeMin()));
    const sheath = component.overlays()
      .filter(overlay => overlay.type === 'CEMENT' && overlay.zone === 'casing-annulus');
    expect(sheath.length).toBeGreaterThan(0);
    for (const band of sheath) {
      // A bainha fica entre o OD do revestimento e a parede externa.
      expect(band.outerDiameterIn!).toBeGreaterThan(band.innerDiameterIn!);
    }
    // A lama de fundo não é pintada, para não esconder a operação.
    expect(component.overlays().every(overlay => overlay.label !== 'Lama')).toBe(true);
  });

  it('P8 — an imported measurement does not change the calculation', () => {
    const { component } = create();
    const before = {
      volumes: component.volumes(),
      pumped: component.transport()!.totalPumpedBbl,
      points: component.hydraulics()!.points.length,
    };
    component.loadCsvText('tempo,retorno\n0,3\n5,4\n');
    component.timeColumn.set('tempo');
    component.setChannelColumn('return-rate', 'retorno');
    component.importDataset();
    expect(component.datasets()).toHaveLength(1);
    expect(component.volumes()).toBe(before.volumes);
    expect(component.transport()!.totalPumpedBbl).toBeCloseTo(before.pumped, 9);
    expect(component.hydraulics()!.points).toHaveLength(before.points);
  });

  it('P10 — the badge says unsaved until the API answers, and an edit undoes it', () => {
    const { component } = create();
    expect(component.saveState().status).toBe('unsaved');
    expect(component.saveState().scenarioId).toBeNull();
    // Editar qualquer coisa mantém o cenário como não salvo.
    component.setTargetToc(0, '540');
    expect(component.saveState().status).toBe('unsaved');
  });

  it('P10 — an invalid file does not replace the open scenario', () => {
    const { component } = create();
    const toc = component.form().stages[0].targetTocMD;
    component.lerArquivo('{ isto não é json');
    expect(component.importSummary()).toBeNull();
    expect(component.scenarioMessage()).toBeTruthy();
    expect(component.form().stages[0].targetTocMD).toBe(toc);
  });

  it('P11 — a partial result does not conclude about the operation', () => {
    const { component } = create();
    const report = component.report();
    expect(report.status).toBe('partial');
    expect(report.conclusion).toContain('não conclui');
    expect(report.conclusion).not.toContain('aprovação');
    // E todos os gráficos seguem listados como não reconstruídos.
    expect(report.charts.every(chart => !chart.available)).toBe(true);
  });

  it('keeps the engine numbers of the reference case after the redesign', () => {
    const { component } = create();
    const placement = component.volumes().stages[0].placements[0];
    expect(placement.annularBbl).toBeCloseTo(74.100075, 6);
    expect(placement.retainedBbl).toBeCloseTo(2.510681114592, 6);
    expect(component.volumes().stages[0].displacementTargetBbl).toBeCloseTo(185.790402479808, 6);
    expect(component.transport()!.totalPumpedBbl).toBeCloseTo(262.401158594400, 6);
  });

  it('renders the five tabs and keeps chart canvases in the simulator result only', () => {
    const { fixture, component } = create();
    const root: HTMLElement = fixture.nativeElement;
    for (const item of component.tabs) {
      component.tab.set(item.id);
      expect(() => fixture.detectChanges()).not.toThrow();
      const main = root.querySelector('.sim-main')!;
      expect(main.textContent!.trim().length).toBeGreaterThan(100);
      if (item.id === 'simulador') expect(main.querySelectorAll('canvas')).toHaveLength(3);
      else expect(main.querySelector('canvas')).toBeNull();
    }
  });
});
