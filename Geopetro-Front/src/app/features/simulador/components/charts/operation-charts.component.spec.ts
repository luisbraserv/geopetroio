import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { summarizeHydroEcd, type OperationCharts, type OperationHydroEcdPoint } from '../../services/operation-charts';
import { OperationChartsComponent } from './operation-charts.component';

afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

const point = (volumeBbl: number, esd: number, ecd: number): OperationHydroEcdPoint => ({
  volumeBbl, timeMin: volumeBbl / 2, hydrostaticPsi: esd * 100, hydrostaticPpg: esd, ecdPpg: ecd, deltaEcdPpg: ecd - esd,
  dynamicPressurePsi: (ecd - esd) * 100, appliedPressurePsi: 0, annularFrictionPsi: (ecd - esd) * 100, outletTVD: 100,
  pumpRateBpm: 2, circulating: true, unavailable: false });

function charts(references: { id: string; title: string }[], extra: Partial<OperationCharts> = {}): OperationCharts {
  return {
    operation: 'tampao',
    references: references.map(entry => {
      const points = [point(0, 9, 9.2), point(5, 9.5, 9.8)];
      return { ...entry, label: entry.id, description: `Descrição ${entry.id}`, tvd: 100, points,
        summary: summarizeHydroEcd(points, false) };
    }),
    envelope: [{ md: 0, tvd: 0, porePpg: null, minHydrostaticPpg: null, minHydrostaticWellPpg: null, maxEcdPpg: null, fracturePpg: null },
      { md: 100, tvd: 100, porePpg: 8.5, minHydrostaticPpg: 9, minHydrostaticWellPpg: 9, maxEcdPpg: 9.8, fracturePpg: 14 }],
    envelopeMarker: { label: 'Topo da fase da operação', md: 0 },
    volumes: [{ id: 'total', label: 'Volume total injetado', color: '#051833', kind: 'total',
      points: [{ timeMin: 0, volumeBbl: 0 }, { timeMin: 2.5, volumeBbl: 5 }] }],
    phases: [{ id: 'p', name: 'Produção', topMD: 0, bottomMD: 100 }],
    operationPhaseId: 'p',
    rheologyWarning: null,
    ...extra,
  };
}

function render(data: OperationCharts) {
  const fixture = TestBed.createComponent(OperationChartsComponent);
  fixture.componentRef.setInput('data', data);
  fixture.componentRef.setInput('selectedPhaseId', 'p');
  fixture.detectChanges();
  return fixture;
}

describe('gráficos de operação comuns', () => {
  it('não mostra seletor de referência quando só há uma', () => {
    const fixture = render(charts([{ id: 'plug-base', title: 'ECD e pressão hidrostática na base do tampão' }]));
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-chart="hydro-ecd"] h3')?.textContent).toBe('ECD e pressão hidrostática na base do tampão');
    expect(root.querySelector('[data-reference-select]')).toBeNull();
    expect(root.querySelectorAll('[data-chart]')).toHaveLength(3);
  });

  it('troca a referência desenhada pelo seletor, sem recalcular', () => {
    const fixture = render(charts([
      { id: 'perforations', title: 'ECD e pressão hidrostática nos canhoneados' },
      { id: 'open-end', title: 'ECD e pressão hidrostática na extremidade da coluna' },
    ], { operation: 'squeeze' }));
    const root = fixture.nativeElement as HTMLElement;
    const select = root.querySelector<HTMLSelectElement>('[data-reference-select]')!;
    expect([...select.options].map(option => option.value)).toEqual(['perforations', 'open-end']);
    expect(root.querySelector('[data-chart="hydro-ecd"] h3')?.textContent).toContain('canhoneados');
    select.value = 'open-end';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.querySelector('[data-chart="hydro-ecd"] h3')?.textContent).toContain('extremidade da coluna');
    expect(root.querySelector('[data-chart="hydro-ecd"] p')?.textContent).toBe('Descrição open-end');
  });

  it('mostra o aviso de reologia que a operação mandar', () => {
    const fixture = render(charts([{ id: 'plug-base', title: 'x' }], { rheologyWarning: 'Reologia da pasta estimada.' }));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Reologia da pasta estimada.');
  });

  it('salva a imagem com o nome da operação', () => {
    const fixture = render(charts([{ id: 'plug-base', title: 'x' }]));
    const anchors: HTMLAnchorElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = create(tag);
      if (tag === 'a') { anchors.push(element as HTMLAnchorElement); vi.spyOn(element, 'click').mockImplementation(() => {}); }
      return element;
    });
    fixture.componentInstance.save({ toDataURL: () => 'data:image/png;base64,' } as unknown as HTMLCanvasElement, 'volume-tempo');
    expect(anchors[0].download).toBe('tampao-volume-tempo.png');
  });

  it('mostra o risco de fratura do squeeze com o limite de superfície e o início da fratura', () => {
    const fixture = render(charts([{ id: 'perforations', title: 'x' }], { operation: 'squeeze', fractureRisk: {
      md: 100, tvd: 100, compression: { from: 5, to: 10 }, surfaceLimitPsi: 600, maxSurfacePressurePsi: 700, belowPore: false,
      fractureStart: { timeMin: 9, pressurePsi: 1400, surfacePressurePsi: 700 },
      points: [{ timeMin: 0, pressurePsi: 900, porePsi: 850, fracturePsi: 1400, surfacePressurePsi: 0, maxSurfacePressurePsi: null },
        { timeMin: 10, pressurePsi: 1500, porePsi: 850, fracturePsi: 1400, surfacePressurePsi: 700, maxSurfacePressurePsi: 600 }] } }));
    const root = fixture.nativeElement as HTMLElement;
    const card = root.querySelector('[data-chart="fracture-risk"]')!;
    expect(root.querySelectorAll('[data-chart]')).toHaveLength(4);
    expect(card.textContent).toContain('Risco de fratura nos canhoneados');
    expect(card.textContent).toContain('600 psi');
    expect(card.querySelector('.pc-alert--danger')?.textContent).toContain('abaixo de 600 psi');
  });
});
