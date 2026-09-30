import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPrimaryWellVisualModel, buildWellVisualModel } from '../../services/primary-well-visuals';
import { PrimaryWell2dComponent } from './primary-well-2d.component';

afterEach(() => TestBed.resetTestingModule());

const well = { finalMD: 100, finalTVD: 100, phases: [{ id: 'p', name: 'P', type: 'PRODUCTION' as const,
  topMD: 0, bottomMD: 100, topTVD: 0, bottomTVD: 100, holeDiameterIn: 8.5 }],
  trajectory: { stations: [{ md: 0, inclinationDeg: 0, azimuthDeg: 0 }, { md: 100, inclinationDeg: 5, azimuthDeg: 90 }] } };

function render(model: ReturnType<typeof buildWellVisualModel>): HTMLElement {
  const fixture = TestBed.createComponent(PrimaryWell2dComponent);
  fixture.componentRef.setInput('views', [{ id: 'all', name: 'Todas as fases', model }]);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('perfil e planta do poço', () => {
  it('sem caliper: nada de legenda, figura ou aviso de caliper', () => {
    const root = render(buildWellVisualModel(well, { caliper: null, showCaliper: false,
      cement: [{ topMD: 70, bottomMD: 90, location: 'wellbore' }], tubulars: [], markers: [] }));
    expect(root.querySelectorAll('figure')).toHaveLength(2);
    expect(root.textContent).not.toContain('Caliper');
    expect(root.textContent).not.toContain('amostras de caliper');
    expect(root.textContent).toContain('O furo usa o diâmetro da fase');
  });

  it('primária sem caliper importado continua avisando, como antes', () => {
    const root = render(buildPrimaryWellVisualModel(well, null, 40, 100));
    expect(root.textContent).toContain('Caliper');
    expect(root.textContent).toContain('Esta fase não possui amostras de caliper');
  });
});
