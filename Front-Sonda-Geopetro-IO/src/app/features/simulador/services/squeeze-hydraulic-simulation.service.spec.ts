import { describe, expect, it } from 'vitest';
import { CoreCalculoService } from './core-calculo.service';
import { SqueezeHydraulicSimulationService } from './squeeze-hydraulic-simulation.service';
import { SqueezeGeometry, SqueezeInputs } from '../models/squeeze.model';
import { SlurryDesign } from '../models/pasta.model';

const geom: SqueezeGeometry = {
  top: 1400, base: 1500, wellFinalMD: 1500, wellFinalTVD: 1500, len: 100,
  perfs: [{ top: 1420, base: 1440 }], deepestPerf: 1440, shallowestPerf: 1420,
  annulusOpen_m: 0.12, annulusCasing_m: 0.06, casingFull_m: 0.08, finalCapacity_m: 0.08, tubingID_m: 0.025,
  annulusVolume: 8, workVolumeBbl: 8, cementHeightWithTubing: 94, cementHeightWithoutTubing: 100,
  displacementVolume: 36, expectedLoss: 2, slurryTotal: 10, slurryPumpedVolumeBbl: 10, slurryInjectedVolumeBbl: 2,
  slurryPhysicalVolumeBbl: 8, cementPhysicalHeight: 100, cementPhysicalTopMD: 1400, cementPhysicalBaseMD: 1500,
  cementPhysicalCapacityBblM: 0.08, washVolFront: 6, washFrontHeight: 100, frontOperationalHeight: 100,
  backOperationalHeight: 50, frontPhysicalVolumeBbl: 6, frontPhysicalHeight: 100, volBackSpacer: 1.25,
  backPhysicalVolumeBbl: 1.25, backPhysicalHeight: 50, displacementHydroBalance: null,
  operationalDisplacementVolumeBbl: 36, oh: 8.535, cOD: 5.5, cID: 4.778, tOD: 2.875, tID: 2.441,
  topCementImmersedMD: 0, topCementAfterPullMD: 0,
  topCementImmersedAfterInjectionMD: 0, topCementAfterInjectionMD: 0,
};

const inputs: SqueezeInputs = {
  sectionStartMD: 1400, sectionEndMD: 1500, sectionStartTVD: 1400, sectionEndTVD: 1500,
  wellFinalMD: 1500, wellFinalTVD: 1500, caliper: 8.535, casingOD: 5.5, casingID: 4.778,
  tubingOD: 2.875, tubingID: 2.441, backSpacerHeight: 50, mudWeightFront: 9.5, mudWeightBack: 9.5,
  completionWeight: 9.5, fracGrad: 16, poreGrad: 9, pumpRate: 2, surfaceTemp: 80.6, geoGradient: 1.5,
  surfacePressure: 400, squeezeTestPressure: 400, expectedLoss: 2, tempoPausaMin: 3, modoOperacao: 'squeeze',
};

const slurry = { density: 15.8 } as SlurryDesign;

describe('SqueezeHydraulicSimulationService', () => {
  const service = new SqueezeHydraulicSimulationService(new CoreCalculoService());

  it('uses the perforation midpoint TVD as the pressure reference', () => {
    const sim = service.simulate(geom, slurry, inputs, geom.perfs);
    expect(sim.summary.referenceMD).toBe(1430);
    expect(sim.summary.referenceTVD).toBe(1430);
  });

  it('calculates pore and fracture pressure at squeeze reference TVD', () => {
    const sim = service.simulate(geom, slurry, inputs, geom.perfs);
    expect(sim.summary.porePsi).toBeCloseTo(0.1706 * 9 * 1430, 6);
    expect(sim.summary.fracturePsi).toBeCloseTo(0.1706 * 16 * 1430, 6);
  });

  it('calculates ECD from BHP and reference TVD', () => {
    const sim = service.simulate(geom, slurry, inputs, geom.perfs);
    const point = sim.points.find(p => p.ecdPpg !== null)!;
    expect(point.ecdPpg).toBeCloseTo(point.bhpPsi / (0.1706 * sim.summary.referenceTVD), 6);
  });

  it('zeros friction and keeps volume unchanged during pauses', () => {
    const sim = service.simulate(geom, slurry, { ...inputs, tempoPausaMin: 5 }, geom.perfs);
    const pause = sim.points.find(p => p.programmedRateBpm === 0 && p.phase === 'Pasta de cimento')!;
    expect(pause.frictionPsi).toBe(0);
    expect(pause.bhpPsi).toBeCloseTo(pause.surfacePressurePsi + pause.hydrostaticPsi, 6);
  });

  it('subtracts tubing friction and adds annular return friction while pumping', () => {
    const sim = service.simulate(geom, slurry, inputs, geom.perfs);
    const pumping = sim.points.find(p => p.programmedRateBpm > 0)!;
    expect(pumping.annularFrictionPsi).toBeGreaterThan(0);
    expect(pumping.bhpPsi).toBeCloseTo(
      pumping.surfacePressurePsi + pumping.hydrostaticPsi - pumping.frictionPsi + pumping.annularFrictionPsi, 6);
  });

  it('reduces annular friction with lower standoff (Petroguia F-40 eccentricity)', () => {
    const concentrico = service.simulate(geom, slurry, { ...inputs, standoffPct: 100 }, geom.perfs);
    const excentrico = service.simulate(geom, slurry, { ...inputs, standoffPct: 60 }, geom.perfs);
    const pC = concentrico.points.find(p => p.phase === 'Água frente' && p.annularFrictionPsi > 0)!;
    const pE = excentrico.points.find(p => p.phase === 'Água frente' && p.annularFrictionPsi > 0)!;
    // Água é newtoniana (n=1): pf/pfo = 1 − (0,44 + 0,18)·(1 − 60/100) = 0,752
    expect(pE.annularFrictionPsi).toBeCloseTo(pC.annularFrictionPsi * (1 - (0.44 + 0.18) * 0.4), 6);
  });

  it('reports pressure envelope alerts above fracture and below pore', () => {
    // Acima da fratura: pressão de operação alta aplicada na fase de injeção
    const above = service.simulate(geom, slurry, { ...inputs, pressaoOperacao: 5000, volMaxInjetadoBbl: 2 }, geom.perfs);
    // Abaixo do poro: fluido do poço leve demais (hidrostática inicial < poro)
    const below = service.simulate(geom, slurry, { ...inputs, completionWeight: 7 }, geom.perfs);
    expect(above.summary.alert).toBe('above-fracture');
    expect(below.summary.alert).toBe('below-pore');
  });

  it('flags equipment limits when HHP, surface pressure or rate are exceeded', () => {
    const ok = service.simulate(geom, slurry, { ...inputs, motorHP: 1000, pumpEff: 90, maxPumpRate: 8 }, geom.perfs);
    expect(ok.summary.hhpAvailable).toBe(900);
    expect(ok.summary.equipmentAlerts).toEqual([]);
    const excedido = service.simulate(geom, slurry, { ...inputs, maxPumpRate: 1 }, geom.perfs);
    expect(excedido.summary.equipmentAlerts.some(a => a.includes('Vazão programada'))).toBe(true);
  });

  it('increases turbulent friction with pipe roughness', () => {
    const novo = service.simulate(geom, slurry, { ...inputs, rugosidadeTubo: 'low' }, geom.perfs);
    const fimVida = service.simulate(geom, slurry, { ...inputs, rugosidadeTubo: 'high' }, geom.perfs);
    // Água frente a 2 bpm em 2.441" está em regime turbulento — rugosidade deve elevar a fricção
    const fNovo = novo.points.find(p => p.phase === 'Água frente' && p.frictionPsi > 0)!;
    const fFim = fimVida.points.find(p => p.phase === 'Água frente' && p.frictionPsi > 0)!;
    expect(fFim.frictionPsi).toBeCloseTo(fNovo.frictionPsi * 1.35, 6);
  });

  it('omits the injection phase and applied pressure in tampao mode', () => {
    const sim = service.simulate(geom, slurry, { ...inputs, modoOperacao: 'tampao', pressaoOperacao: 2000, volMaxInjetadoBbl: 2 }, geom.perfs);
    expect(sim.points.some(p => p.phase === 'Injeção/pressurização final')).toBe(false);
    expect(sim.summary.maxSurfacePressurePsi).toBe(0);
  });

  it('applies the operating pressure only during the final injection phase', () => {
    const sim = service.simulate(geom, slurry, { ...inputs, pressaoOperacao: 2000, volMaxInjetadoBbl: 2, tempoPressurizacaoMin: 10 }, geom.perfs);
    const pumping = sim.points.find(p => p.phase === 'Pasta de cimento')!;
    const injection = sim.points.find(p => p.phase === 'Injeção/pressurização final')!;
    expect(pumping.surfacePressurePsi).toBe(0);
    expect(injection.surfacePressurePsi).toBe(2000);
    expect(sim.summary.maxSurfacePressurePsi).toBe(2000);
    expect(injection.bhpPsi).toBeCloseTo(2000 + injection.hydrostaticPsi - injection.frictionPsi, 6);
  });

  it('renders the same operational chart categories and avoids invalid free fall values', () => {
    const sim = service.simulate(geom, slurry, { ...inputs, pumpRate: 0 }, geom.perfs);
    expect(sim.categories).toEqual([
      'Pressão e deslocamento x tempo',
      'BHP/ECD x tempo',
      'Free fall/tubo em U',
      'Índice operacional por fase',
      'Resumo de volumes/fases',
    ]);
    for (const point of sim.points) {
      expect(Number.isFinite(point.freeFallAccumBbl)).toBe(true);
      expect(Number.isFinite(point.realRateBpm)).toBe(true);
    }
  });
});
