import { describe, expect, it } from 'vitest';
import { buildPrimaryWellVisualModel, buildWellVisualModel, primaryReportVisuals } from './primary-well-visuals';

describe('primary 2D well visuals', () => {
  it('builds profile, plan and caliper views with centered casing and cement', () => {
    const well = { finalMD: 100, finalTVD: 100, phases: [{ id: 'p', name: 'P', type: 'PRODUCTION' as const,
      topMD: 0, bottomMD: 100, topTVD: 0, bottomTVD: 100, holeDiameterIn: 12,
      casing: { odIn: 9, idIn: 8, bottomMD: 100 } }],
      trajectory: { stations: [{ md: 0, inclinationDeg: 0, azimuthDeg: 0 }, { md: 100, inclinationDeg: 20, azimuthDeg: 90 }] } };
    const caliper = { fileName: 'x.las', importedAt: '', depthMnemonic: 'DEPT', diameterMnemonics: ['EHD1','EHD2'] as [string,string],
      startMD: 0, stopMD: 100, sampleCount: 2, calculatedHoleVolumeM3: 1, reportedHoleVolumeM3: null,
      volumeDifferencePct: null, samples: [{ md: 0, ehd1In: 12, ehd2In: 13 }, { md: 100, ehd1In: 14, ehd2In: 15 }] };
    const model = buildPrimaryWellVisualModel(well, caliper, 40, 100);
    expect(model.profile.cement.length).toBeGreaterThan(0);
    expect(model.profile.xTicks).toHaveLength(6);
    expect(model.profile.yTicks).toHaveLength(6);
    expect(model.plan.center).toContain('L');
    expect(model.plan.stations).toHaveLength(2);
    expect(model.caliper?.envelope).toMatch(/Z$/);
    expect(model.caliper?.xTicks).toHaveLength(9);
    const report = primaryReportVisuals(model);
    expect(report.map(item => item.id)).toEqual(['profile', 'plan', 'caliper']);
    expect(report[2].svg).toContain('viewBox="0 0 720 460"');
    expect(report[2].svg).toContain('report-caliper-hatch');
  });

  it('clips caliper and nominal diameter to the selected phase without joining phase boundaries', () => {
    const well = { finalMD: 100, finalTVD: 100, phases: [
      { id: 'p1', name: '26 in', type: 'SURFACE' as const, topMD: 0, bottomMD: 50,
        topTVD: 0, bottomTVD: 50, holeDiameterIn: 26 },
      { id: 'p2', name: '17.5 in', type: 'INTERMEDIATE' as const, topMD: 50, bottomMD: 100,
        topTVD: 50, bottomTVD: 100, holeDiameterIn: 17.5 },
    ], trajectory: { stations: [{ md: 0, inclinationDeg: 0, azimuthDeg: 0 },
      { md: 100, inclinationDeg: 10, azimuthDeg: 0 }] } };
    const caliper = { fileName: 'x.las', importedAt: '', depthMnemonic: 'DEPT',
      diameterMnemonics: ['EHD1', 'EHD2'] as [string, string], startMD: 50, stopMD: 100,
      sampleCount: 2, calculatedHoleVolumeM3: 1, reportedHoleVolumeM3: null,
      volumeDifferencePct: null, samples: [{ md: 50, ehd1In: 16, ehd2In: 18 },
        { md: 100, ehd1In: 17, ehd2In: 19 }] };
    const phase = buildPrimaryWellVisualModel(well, caliper, 50, 100,
      { phaseId: 'p2', topMD: 50, bottomMD: 100 });
    expect(phase.bounds.topMD).toBe(50);
    expect(phase.bounds.bottomMD).toBe(100);
    expect(phase.caliper?.xTicks.at(-1)?.label).toBe('19.5');
    const nominal = [...(phase.caliper?.nominal ?? '').matchAll(/M([\d.]+),48\.00 L([\d.]+),408\.00/g)];
    expect(nominal).toHaveLength(2);
    expect(nominal.every(segment => segment[1] === segment[2])).toBe(true);
    expect(Number(nominal[0][1])).toBeLessThan(384);
    expect(Number(nominal[1][1])).toBeGreaterThan(384);
    const all = buildPrimaryWellVisualModel(well, caliper, 50, 100);
    expect(all.caliper?.maxIn).toBeLessThan(20);
  });

  it('desenha tampão sem caliper: poço cheio de cimento no intervalo e nenhuma curva de caliper', () => {
    const well = { finalMD: 100, finalTVD: 100, phases: [{ id: 'p', name: 'P', type: 'PRODUCTION' as const,
      topMD: 0, bottomMD: 100, topTVD: 0, bottomTVD: 100, holeDiameterIn: 8.5 }],
      trajectory: { stations: [{ md: 0, inclinationDeg: 0, azimuthDeg: 0 }, { md: 100, inclinationDeg: 0, azimuthDeg: 0 }] } };
    const caliper = { fileName: 'x.las', importedAt: '', depthMnemonic: 'DEPT', diameterMnemonics: ['EHD1', 'EHD2'] as [string, string],
      startMD: 0, stopMD: 100, sampleCount: 2, calculatedHoleVolumeM3: 1, reportedHoleVolumeM3: null,
      volumeDifferencePct: null, samples: [{ md: 0, ehd1In: 12, ehd2In: 13 }, { md: 100, ehd1In: 14, ehd2In: 15 }] };
    // Mesmo recebendo um caliper, a operação sem caliper o ignora.
    const model = buildWellVisualModel(well, { caliper, showCaliper: false,
      cement: [{ topMD: 70, bottomMD: 90, location: 'wellbore' }], tubulars: [{ topMD: 0, bottomMD: 60 }],
      markers: [{ md: 70, label: 'Topo do tampão' }, { md: 90, label: 'Base do tampão' }] });
    expect(model.showCaliper).toBe(false);
    expect(model.caliper).toBeNull();
    expect(model.profile.hole.every(line => !line.measured)).toBe(true);
    expect(model.profile.cement.length).toBeGreaterThan(0);
    expect(model.profile.cement.every(line => line.md1 >= 70 - 1e-9 && line.md2 <= 90 + 1e-9)).toBe(true);
    // No tampão o cimento ocupa o poço inteiro, com a largura do furo.
    const hole = new Map(model.profile.hole.map(line => [line.md1, line.width]));
    expect(model.profile.cement.every(line => line.width === hole.get(line.md1))).toBe(true);
    expect(model.profile.casing.every(line => line.md2 <= 60 + 1e-9)).toBe(true);
    expect(model.profile.markers.map(marker => marker.label)).toEqual(['Topo do tampão 70.0 m MD', 'Base do tampão 90.0 m MD']);
    expect(primaryReportVisuals(model).map(item => item.id)).toEqual(['profile', 'plan']);
  });
});
