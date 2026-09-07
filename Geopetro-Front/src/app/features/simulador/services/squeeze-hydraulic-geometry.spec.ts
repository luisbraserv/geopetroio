import { describe, expect, it } from 'vitest';
import { WellGeometry } from '../models/well-geometry.model';
import { SqueezeInputs } from '../models/squeeze.model';
import { SlurryDesign } from '../models/pasta.model';
import { BBL_M } from '../models/constantes';
import { CoreCalculoService } from './core-calculo.service';
import { SqueezeCalculoService } from './squeeze-calculo.service';
import { SqueezeHydraulicSimulationService } from './squeeze-hydraulic-simulation.service';

const geometry: WellGeometry = { finalMD: 200, finalTVD: 80, phases: [
  { id: 'a', name: 'Inclinado', type: 'OPEN_HOLE', topMD: 0, bottomMD: 100, topTVD: 0, bottomTVD: 80, holeDiameterIn: 4 },
  { id: 'b', name: 'Horizontal', type: 'OPEN_HOLE', topMD: 100, bottomMD: 200, topTVD: 80, bottomTVD: 80, holeDiameterIn: 6 },
] };
const inputs: SqueezeInputs = {
  sectionStartMD: 150, sectionEndMD: 200, sectionStartTVD: 150, sectionEndTVD: 200,
  wellFinalMD: 200, wellFinalTVD: 200,
  caliper: 8.5, casingOD: 5.5, casingID: 4.778, tubingOD: 2.875, tubingID: 2,
  backSpacerHeight: 0, mudWeightFront: 10, mudWeightBack: 10, completionWeight: 10,
  fracGrad: 16, poreGrad: 9, pumpRate: 2, surfaceTemp: 80, geoGradient: 1.5,
  profundidadeReferenciaSqueezeMD: 200, profundidadeReferenciaSqueezeTVD: 999,
  volumeAguaFrenteBbl: 10, volumePastaBbl: 0, volumeAguaAtrasBbl: 0, volumeDeslocamentoBbl: 0,
  volMaxInjetadoBbl: 0, modoOperacao: 'tampao',
};
const perfs = [{ top: 180, base: 200 }];
const core = new CoreCalculoService();
const calc = new SqueezeCalculoService(core);
const engine = new SqueezeHydraulicSimulationService(core);

function simulate(well = geometry, overrides: Partial<SqueezeInputs> = {}) {
  const context = { geometry: well, interval: { topMD: 150, bottomMD: 200 } };
  const v = { ...inputs, ...overrides };
  const geom = calc.calcVolumes(v, perfs, null, context);
  return engine.simulate(geom, { density: 10 } as SlurryDesign, v, perfs, [], {}, context);
}

describe('Hidráulica com geometria por trechos', () => {
  it('deriva TVD da geometria, ignorando o valor legado divergente', () => {
    const sim = simulate();
    expect(sim.summary.referenceMD).toBe(200);
    expect(sim.summary.referenceTVD).toBe(80);
    expect(sim.summary.porePsi).toBeCloseTo(0.1706 * 9 * 80, 9);
    expect(sim.points[0].hydrostaticPsi).toBeCloseTo(0.1706 * 10 * 80, 9);
    for (const p of sim.points) expect(p.ecdPpg).toBeCloseTo(p.bhpPsi / (0.1706 * 80), 9);
    expect(sim.annularProfile.points.some(p => p.md === 100 && p.tvd === 80)).toBe(true);
    expect(sim.annularProfile.points.at(-1)?.md).toBe(200);
  });

  it('soma a fricção de cada diâmetro e acumula atrito mesmo no trecho horizontal', () => {
    const uniform = (diameter: number): WellGeometry => ({
      ...geometry, phases: geometry.phases.map(p => ({ ...p, holeDiameterIn: diameter })),
    });
    const mixed = simulate();
    const narrow = simulate(uniform(4));
    const wide = simulate(uniform(6));
    const expected = (narrow.points[0].annularFrictionPsi + wide.points[0].annularFrictionPsi) / 2;
    expect(mixed.points[0].annularFrictionPsi).toBeCloseTo(expected, 9);
    const atShoe = mixed.annularProfile.points.find(p => p.md === 100)!;
    const atBottom = mixed.annularProfile.points.at(-1)!;
    expect(atBottom.tvd).toBe(atShoe.tvd);
    expect(atBottom.maxAnnularPsi - atShoe.maxAnnularPsi).toBeCloseTo(wide.points[0].annularFrictionPsi / 2, 9);
    expect(atBottom.maxAnnularPsi).toBeGreaterThan(atShoe.maxAnnularPsi);
  });

  it('não libera fluido no anular antes de percorrer o MD completo da coluna', () => {
    const cap = BBL_M * inputs.tubingID ** 2;
    const sim = simulate(geometry, { volumeAguaFrenteBbl: cap * 150, mudWeightFront: 16 });
    const p = sim.points.filter(p => p.phase === 'Água frente').at(-1)!;
    expect(p.pumpedVolumeBbl).toBeCloseTo(cap * 150, 9);
    expect(p.hydrostaticPsi).toBeCloseTo(0.1706 * 16 * 80, 9);
    // Ainda há 50 m de completação dentro da coluna. Anular continua a 10 ppg.
    expect(p.hydrostaticPsi - p.drivePsi).toBeCloseTo(0.1706 * 10 * 80, 9);
  });

  it('usa a extremidade da coluna para transporte mesmo com referência de pressão mais rasa', () => {
    const cap = BBL_M * inputs.tubingID ** 2;
    const sim = simulate(geometry, {
      profundidadeReferenciaSqueezeMD: 100, volumeAguaFrenteBbl: cap * 150, mudWeightFront: 16,
    });
    const p = sim.points.filter(p => p.phase === 'Água frente').at(-1)!;
    expect(p.hydrostaticPsi - p.drivePsi).toBeCloseTo(0.1706 * 10 * 80, 9);
    expect(sim.annularProfile.bottomMD).toBe(100);
  });

  it('conserva o volume programado quando um passo atravessa o início da pausa', () => {
    const sim = simulate(geometry, { volumeAguaFrenteBbl: 2.5, pause1: 0.7 } as Partial<SqueezeInputs>);
    const water = sim.points.filter(p => p.phase === 'Água frente');
    expect(water.at(-1)?.pumpedVolumeBbl).toBeCloseTo(2.5, 9);
    expect(water.at(-1)?.programmedRateBpm).toBe(0);
    expect(water.at(-1)?.frictionPsi).toBe(0);
    expect(water.at(-1)?.annularFrictionPsi).toBe(0);
  });

  it('calcula a pressão de bombeio no caminho completo, independente da referência de BHP', () => {
    const deep = simulate();
    const shallow = simulate(geometry, { profundidadeReferenciaSqueezeMD: 100 });
    expect(shallow.points[0].annularFrictionPsi).toBeLessThan(deep.points[0].annularFrictionPsi);
    deep.points.forEach((p, i) => expect(shallow.points[i].pumpPressurePsi).toBeCloseTo(p.pumpPressurePsi, 8));
  });

  it('não altera o resultado ao subdividir uma fase uniforme', () => {
    const one: WellGeometry = { finalMD: 200, finalTVD: 160, phases: [
      { ...geometry.phases[0], bottomMD: 200, bottomTVD: 160 },
    ] };
    const split: WellGeometry = { ...one, phases: [
      geometry.phases[0], { ...geometry.phases[1], holeDiameterIn: 4, bottomTVD: 160 },
    ] };
    const a = simulate(one);
    const b = simulate(split);
    expect(a.points.length).toBe(b.points.length);
    a.points.forEach((p, i) => {
      expect(b.points[i].bhpPsi).toBeCloseTo(p.bhpPsi, 8);
      expect(b.points[i].pumpPressurePsi).toBeCloseTo(p.pumpPressurePsi, 8);
      expect(b.points[i].freeFallAccumBbl).toBeCloseTo(p.freeFallAccumBbl, 8);
    });
  });

  it.each([0, 400])('fecha o retorno e mantém a contabilidade da injeção (pressão=%s)', pressaoOperacao => {
    const sim = simulate(geometry, { modoOperacao: 'squeeze', pressaoOperacao, volMaxInjetadoBbl: 2 });
    const injection = sim.points.filter(p => p.phase === 'Injeção/pressurização final');
    expect(injection.every(p => p.annularFrictionPsi === 0 && p.freeFallExtraRateBpm === 0)).toBe(true);
    expect(injection.at(-1)?.injectedVolumeBbl).toBeCloseTo(2, 9);
    expect(injection.at(-1)?.pumpedVolumeBbl).toBeCloseTo(8, 9);
  });
});
