import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  HYDRO_PSI_PER_PPG_M,
  calculateSegmentedHydrostatic,
  calculateEcdFromBhp,
  calculateFrictionLoss,
  calcFreeFallState,
  solveFreeFallRate
} = require('../public/simulador/js/shared/hydraulics.js');

const tvdAt = md => md;

describe('shared hydraulics', () => {
  it('calcula hidrostatica simples por TVD', () => {
    const result = calculateSegmentedHydrostatic({
      refMD: 1000,
      tvdAt,
      segments: [{ topMD: 0, baseMD: 1000, densityPpg: 10 }]
    });

    expect(result.pressurePsi).toBeCloseTo(0.1706 * 10 * 1000, 1);
  });

  it('calcula hidrostatica segmentada por fluido', () => {
    const result = calculateSegmentedHydrostatic({
      refMD: 1000,
      tvdAt,
      segments: [
        { topMD: 0, baseMD: 500, densityPpg: 8.4 },
        { topMD: 500, baseMD: 1000, densityPpg: 15.8 }
      ]
    });

    expect(result.pressurePsi).toBeCloseTo(0.1706 * ((8.4 * 500) + (15.8 * 500)), 1);
  });

  it('calcula ECD a partir de BHP e TVD', () => {
    const bhp = HYDRO_PSI_PER_PPG_M * 12.5 * 1400;
    const result = calculateEcdFromBhp(bhp, 1400);

    expect(result.warning).toBeNull();
    expect(result.value).toBeCloseTo(12.5, 6);
  });

  it('retorna aviso quando TVD de referencia e invalido', () => {
    const result = calculateEcdFromBhp(1000, 0);

    expect(result.value).toBeNull();
    expect(result.warning).toContain('TVD_ref <= 0');
  });

  it('zera friccao no squeeze parado', () => {
    const hydro = 1706;
    const surfacePressure = 500;
    const friction = calculateFrictionLoss({
      path: 'coluna',
      flowRateBpm: 0,
      lengthMD: 1000,
      geometry: { innerDiameterIn: 2 }
    });

    expect(friction).toBe(0);
    expect(surfacePressure + hydro - friction).toBeCloseTo(surfacePressure + hydro, 6);
  });

  it('subtrai friccao no squeeze bombeando', () => {
    const hydro = 1706;
    const surfacePressure = 500;
    const friction = calculateFrictionLoss({
      path: 'coluna',
      flowRateBpm: 4,
      lengthMD: 1000,
      geometry: { innerDiameterIn: 2 },
      fluidsBySegment: [{ topMD: 0, baseMD: 1000, densityPpg: 12 }],
      rheology: { n: 0.6, k: 1 }
    });

    expect(friction).toBeGreaterThan(0);
    expect(surfacePressure + hydro - friction).toBeLessThan(surfacePressure + hydro);
  });

  it('soma friccao anular no tampao com pressao anular zero', () => {
    const hydroAnn = 1800;
    const frictionAnn = calculateFrictionLoss({
      path: 'anular',
      flowRateBpm: 4,
      lengthMD: 1000,
      referenceTVD: 1000,
      geometry: { holeIdIn: 6, pipeOdIn: 2.375 },
      fluidsBySegment: [{ topMD: 0, baseMD: 1000, densityPpg: 12 }]
    });

    expect(frictionAnn).toBeGreaterThan(0);
    expect(hydroAnn + frictionAnn).toBeGreaterThan(hydroAnn);
  });

  it('permite free fall durante pausa', () => {
    const state = calcFreeFallState({
      drivePsi: 250,
      pumpRate: 4,
      pumpRateActual: 0,
      previousVolumeBbl: 0,
      dtMin: 1,
      internalCapacityBblM: 0.01,
      frictionLossFn: q => 20 * q * q
    });

    expect(state.qNaturalBpm).toBeGreaterThan(0);
    expect(state.realRateBpm).toBeGreaterThan(0);
    expect(state.volumeBbl).toBeGreaterThan(0);
  });

  it('nao acumula free fall quando drive e zero', () => {
    const state = calcFreeFallState({
      drivePsi: 0,
      pumpRate: 4,
      pumpRateActual: 0,
      previousVolumeBbl: 0,
      dtMin: 1,
      internalCapacityBblM: 0.01,
      frictionLossFn: q => 20 * q * q
    });

    expect(state.qNaturalBpm).toBe(0);
    expect(state.volumeBbl).toBe(0);
  });

  it('protege contra divisao por zero no solver de free fall', () => {
    const solution = solveFreeFallRate({
      drivePsi: 100,
      pumpRateBpm: 0,
      lossAtPumpRatePsi: 0,
      frictionLossFn: () => 0
    });

    expect(Number.isFinite(solution.qNaturalBpm)).toBe(true);
    expect(solution.qNaturalBpm).toBeGreaterThanOrEqual(0);
  });
});
