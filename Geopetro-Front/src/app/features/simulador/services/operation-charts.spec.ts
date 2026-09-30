import { describe, expect, it } from 'vitest';
import type { PrimaryFluid } from '../models/primary-cementing.model';
import type { PrimaryHydraulicsResult } from '../models/primary-hydraulics.model';
import type { PrimaryProgramVolumes } from '../models/primary-volumes.model';
import { envelopeOutOfWindow, fractureStartOf, operationReportVisuals, operationWindowRuns, pressureEnvelopeForPhase, summarizeHydroEcd, synchronizedHydroEcdAxes,
  type OperationCharts, type OperationHydroEcdPoint } from './operation-charts';
import { K } from './primary-hydraulics';
import { buildPrimaryOperationCharts } from './primary-operation-charts';

const fluid = (id: string, kind: PrimaryFluid['kind'], name: string): PrimaryFluid => ({
  id, kind, name, densityPpg: 10, rheology: { model: 'power-law', n: 1, kLbfSnFt2: .001 },
  propertySources: {},
});

describe('operation charts', () => {
  it('uses calculated hydrostatic, ECD and resolved volume per fluid', () => {
    const hydraulics = {
      points: [
        { pumpedVolumeBbl: 0, annularHydrostaticPsi: K * 10 * 100, ecdPpg: 10,
          bhpPsi: K * 10 * 100, annularFrictionPsi: 0, activeOutletMD: 100,
          phase: 'pump', pumpRateBpm: 5, references: [{ md: 100, tvd: 100 }] },
        { pumpedVolumeBbl: 15, annularHydrostaticPsi: K * 11 * 200, ecdPpg: 12,
          bhpPsi: K * 12 * 200, annularFrictionPsi: K * 200, activeOutletMD: 200,
          phase: 'pump', pumpRateBpm: 5, references: [{ md: 200, tvd: 200 }] },
        { pumpedVolumeBbl: 20, annularHydrostaticPsi: K * 11 * 200, ecdPpg: null,
          bhpPsi: null, annularFrictionPsi: null, activeOutletMD: 200,
          phase: 'pump', pumpRateBpm: 5, references: [{ md: 200, tvd: 200 }] },
      ],
      envelope: [
        { md: 100, tvd: 100, porePsi: K * 9 * 100, fracturePsi: K * 15 * 100,
          minAnnularPsi: K * 10 * 100, maxAnnularPsi: K * 12 * 100,
          minHydrostaticPsi: K * 9.5 * 100, maxHydrostaticPsi: K * 11 * 100 },
        { md: 200, tvd: 200, porePsi: K * 9 * 200, fracturePsi: K * 15 * 200,
          minAnnularPsi: K * 10 * 200, maxAnnularPsi: K * 13 * 200,
          minHydrostaticPsi: K * 10.5 * 200, maxHydrostaticPsi: K * 12 * 200 },
      ],
    } as unknown as PrimaryHydraulicsResult;
    const program = { stages: [{ stageId: 's', targetTocMD: 0, outletMD: 200,
      placements: [], cementPlannedBbl: 10, cementProgrammedBbl: 10,
      displacementTargetBbl: 0, displacementProgrammedBbl: 0, displacementFractionSum: 0,
      totalPumpedBbl: 15, totalTimeMin: 3, idealToc: null,
      steps: [
        { stageId: 's', stepId: 'cement', kind: 'pump', fluidId: 'cement', source: 'entered',
          placementId: null, fraction: null, volumeBbl: 10, rateBpm: 5, durationMin: 2 },
        { stageId: 's', stepId: 'spacer', kind: 'pump', fluidId: 'spacer', source: 'entered',
          placementId: null, fraction: null, volumeBbl: 5, rateBpm: 5, durationMin: 1 },
      ] }], totalPumpedBbl: 15, totalCementPlannedBbl: 10,
      totalCementProgrammedBbl: 10, totalTimeMin: 3, valid: true, diagnostics: [],
    } as PrimaryProgramVolumes;
    const data = buildPrimaryOperationCharts(hydraulics, program,
      [fluid('cement', 'cement', 'Pasta'), fluid('spacer', 'spacer', 'Espacador')],
      [{ id: 'a', name: 'Fase A', topMD: 0, bottomMD: 100 },
        { id: 'b', name: 'Fase B', topMD: 100, bottomMD: 200 }], 'b');

    expect(data.envelope[0].porePpg).toBeCloseTo(9, 9);
    // Duas linhas: a hidrostática mínima em cada profundidade e a mínima do poço inteiro.
    expect(data.envelope[0].minHydrostaticPpg).toBeCloseTo(9.5, 9);
    expect(data.envelope[1].minHydrostaticPpg).toBeCloseTo(10.5, 9);
    expect(data.envelope.map(row => row.minHydrostaticWellPpg)).toEqual([9.5, 9.5].map(v => expect.closeTo(v, 9)));
    expect(data.envelope[0].maxEcdPpg).toBeCloseTo(12, 9);
    expect(data.envelope[0].fracturePpg).toBeCloseTo(15, 9);
    const outlet = data.references[0];
    expect(data.references).toHaveLength(1);
    expect(outlet.tvd).toBe(200);
    expect(outlet.points[0].hydrostaticPpg).toBeCloseTo(10, 12);
    expect(outlet.points[1].hydrostaticPpg).toBeCloseTo(11, 12);
    expect(outlet.points[1].deltaEcdPpg).toBeCloseTo(1, 12);
    expect(outlet.summary).toMatchObject({ circulatingSamples: 3,
      unavailableSamples: 1, maxEcdPpg: 12, maxDeltaEcdPpg: 1 });
    expect(data.operationPhaseId).toBe('b');
    expect(data.envelopeMarker).toEqual({ label: 'Sapata anterior', md: 100 });
    expect(data.rheologyWarning).toBeNull();
    const axes = synchronizedHydroEcdAxes(outlet);
    expect(axes.pressureMin / (K * outlet.tvd)).toBeCloseTo(axes.ecdMin, 12);
    expect(axes.pressureMax / (K * outlet.tvd)).toBeCloseTo(axes.ecdMax, 12);
    expect(data.volumes.find(series => series.id === 'total')?.points.at(-1)?.volumeBbl).toBe(15);
    expect(data.volumes.find(series => series.id === 'cement')?.points.at(-1)?.volumeBbl).toBe(10);
    expect(pressureEnvelopeForPhase(data, 'a')).toHaveLength(1);
    expect(pressureEnvelopeForPhase(data, 'all')).toHaveLength(2);

    const report = operationReportVisuals(data, 'b');
    expect(report.map(entry => entry.id)).toEqual([
      'hydrostatic-ecd', 'pressure-envelope-b', 'injected-volume-time',
    ]);
    expect(report[1].svg).toContain('stroke-dasharray="3 4"');
    expect(report[0].svg).toContain('Pressao hidrostatica (psi)');
    expect(report[0].svg).toContain('ECD (ppg)');
    expect(report[0].svg).toContain('ECD indisponivel');
    expect(report[1].svg).toContain('Sapata anterior');
    expect(report[1].title).toContain('Fase B');
  });

  it('mantém o aviso de reologia simplificada da primária pelo valor de água de 1 cP', () => {
    const water = { ...fluid('cement', 'cement', 'Pasta'), rheology: { model: 'power-law' as const, n: 1, kLbfSnFt2: 0.000020885 } };
    const program = { stages: [], totalPumpedBbl: 0, totalCementPlannedBbl: 0, totalCementProgrammedBbl: 0,
      totalTimeMin: 0, valid: true, diagnostics: [] } as unknown as PrimaryProgramVolumes;
    const data = buildPrimaryOperationCharts(null, program, [water], []);
    expect(data.rheologyWarning).toContain('reologia simplificada');
    expect(data.envelopeMarker).toBeNull();
  });

  it('desenha a referência escolhida, o marcador da operação e a série extra', () => {
    const point = (volumeBbl: number, tvd: number, esd: number, ecd: number): OperationHydroEcdPoint => ({
      volumeBbl, timeMin: volumeBbl / 2, hydrostaticPsi: K * esd * tvd, hydrostaticPpg: esd, ecdPpg: ecd, deltaEcdPpg: ecd - esd,
      dynamicPressurePsi: K * (ecd - esd) * tvd, appliedPressurePsi: 0, annularFrictionPsi: K * (ecd - esd) * tvd, outletTVD: tvd,
      pumpRateBpm: 2, circulating: true, unavailable: false });
    const reference = (id: string, title: string, tvd: number, esd: number) => {
      const points = [point(0, tvd, esd, esd + .2), point(10, tvd, esd + .5, esd + .8)];
      return { id, label: id, title, description: '', tvd, points, summary: summarizeHydroEcd(points, false) };
    };
    const data: OperationCharts = {
      operation: 'squeeze',
      references: [reference('perforations', 'ECD e pressão hidrostática nos canhoneados', 150, 9),
        reference('open-end', 'ECD e pressão hidrostática na extremidade da coluna', 200, 10)],
      envelope: [{ md: 50, tvd: 50, porePpg: 8.5, minHydrostaticPpg: 9, minHydrostaticWellPpg: 9, maxEcdPpg: 9.5, fracturePpg: 14 },
        { md: 200, tvd: 200, porePpg: 8.5, minHydrostaticPpg: 9.2, minHydrostaticWellPpg: 9, maxEcdPpg: 10.8, fracturePpg: 14,
          compressionEcdPpg: 12.1 }],
      envelopeMarker: { label: 'Topo da fase da operação', md: 50 },
      volumes: [
        { id: 'total', label: 'Volume total injetado', color: '#051833', kind: 'total',
          points: [{ timeMin: 0, volumeBbl: 0 }, { timeMin: 5, volumeBbl: 10 }] },
        { id: 'formation', label: 'Injetado na formação', color: '#7c3aed', kind: 'extra',
          points: [{ timeMin: 0, volumeBbl: 0 }, { timeMin: 5, volumeBbl: 2 }] },
      ],
      phases: [{ id: 'p', name: 'Produção', topMD: 50, bottomMD: 200 }],
      operationPhaseId: 'p',
      rheologyWarning: null,
    };
    const byDefault = operationReportVisuals(data);
    expect(byDefault[0].svg).toContain('ECD e pressao hidrostatica nos canhoneados');
    const openEnd = operationReportVisuals(data, 'all', 'open-end');
    expect(openEnd[0].svg).toContain('ECD e pressao hidrostatica na extremidade da coluna');
    // As escalas se amarram na TVD da referência desenhada, não na mais funda.
    const axes = synchronizedHydroEcdAxes(data.references[0]);
    expect(axes.pressureMax / (K * 150)).toBeCloseTo(axes.ecdMax, 12);
    expect(openEnd[1].svg).toContain('Topo da fase da operacao');
    expect(openEnd[2].svg).toContain('stroke="#7c3aed" stroke-width="2.5" stroke-dasharray="2 3"');
    expect(openEnd[2].svg).toContain('stroke="#051833" stroke-width="3"/>');
  });

  it('janela operacional: trechos com poro e fratura, e o que fica fora dela', () => {
    const row = (md: number, pore: number | null, frac: number | null, ecd: number | null, hydro: number | null,
      compression: number | null = null) => ({ md, tvd: md, porePpg: pore, fracturePpg: frac, maxEcdPpg: ecd,
      minHydrostaticPpg: hydro, minHydrostaticWellPpg: hydro, compressionEcdPpg: compression });
    const envelope = [row(0, null, null, null, null), row(100, null, null, 9, 8.4), row(200, 9, 14, 9.5, 8.4),
      row(210, 9, 14, 14.5, 9.2, 15), row(300, null, null, 9.6, 8.4), row(400, 8.8, 13, 9.7, 9)];
    const runs = operationWindowRuns(envelope);
    expect(runs.map(run => run.map(p => p.md))).toEqual([[200, 210], [400]]);
    const outside = envelopeOutOfWindow(envelope);
    // Acima da fratura: o ECD do bombeio e o da compressão a 210 m.
    expect(outside.aboveFracture).toEqual([{ tvd: 210, ppg: 14.5 }, { tvd: 210, ppg: 15 }]);
    // Abaixo do poro: a hidrostática de 8,4 ppg contra 9 ppg a 200 m; fora da formação exposta, nada.
    expect(outside.belowPore).toEqual([{ tvd: 200, ppg: 8.4 }]);
  });

  it('início da fratura interpolado entre os pontos vizinhos', () => {
    const p = (timeMin: number, pressurePsi: number) => ({ timeMin, pressurePsi, porePsi: 500, fracturePsi: 1000,
      surfacePressurePsi: timeMin, maxSurfacePressurePsi: null });
    expect(fractureStartOf([p(0, 800), p(10, 900)])).toBeNull();
    const start = fractureStartOf([p(0, 800), p(10, 1200)])!;
    expect(start.timeMin).toBeCloseTo(5, 9);
    expect(start.pressurePsi).toBeCloseTo(1000, 9);
    expect(start.surfacePressurePsi).toBe(10);
  });

  it('SVG do envelope com a janela em verde e o de risco de fratura só quando a operação manda', () => {
    const data = {
      operation: 'squeeze' as const, references: [], envelopeMarker: null, volumes: [], phases: [], operationPhaseId: null,
      rheologyWarning: null,
      envelope: [{ md: 0, tvd: 0, porePpg: null, minHydrostaticPpg: null, minHydrostaticWellPpg: null, maxEcdPpg: null, fracturePpg: null },
        { md: 100, tvd: 100, porePpg: 8.5, minHydrostaticPpg: 9, minHydrostaticWellPpg: 9, maxEcdPpg: 15, fracturePpg: 14 },
        { md: 200, tvd: 200, porePpg: 8.5, minHydrostaticPpg: 9, minHydrostaticWellPpg: 9, maxEcdPpg: 9.8, fracturePpg: 14 }],
    };
    const without = operationReportVisuals(data);
    expect(without.map(v => v.id)).not.toContain('fracture-risk');
    const envelope = without.find(v => v.id.startsWith('pressure-envelope'))!.svg;
    expect(envelope).toContain('<polygon');
    expect(envelope).toContain('Janela operacional');
    expect(envelope).toContain('Acima da fratura');
    const risk = { md: 100, tvd: 100, compression: { from: 5, to: 10 }, surfaceLimitPsi: 600, maxSurfacePressurePsi: 700,
      belowPore: false, fractureStart: { timeMin: 9, pressurePsi: 1400, surfacePressurePsi: 700 },
      points: [{ timeMin: 0, pressurePsi: 900, porePsi: 850, fracturePsi: 1400, surfacePressurePsi: 0, maxSurfacePressurePsi: null },
        { timeMin: 10, pressurePsi: 1500, porePsi: 850, fracturePsi: 1400, surfacePressurePsi: 700, maxSurfacePressurePsi: 600 }] };
    const withRisk = operationReportVisuals({ ...data, fractureRisk: risk });
    const svg = withRisk.find(v => v.id === 'fracture-risk')!.svg;
    expect(svg).toContain('Zona de fratura');
    expect(svg).toContain('Maior pressao de superficie sem fraturar: 600 psi');
    expect(svg).toContain('FRATURA a partir de 9.0 min');
  });
});
