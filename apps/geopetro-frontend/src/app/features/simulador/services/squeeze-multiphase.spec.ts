import { describe, expect, it } from 'vitest';
import { CoreCalculoService } from './core-calculo.service';
import { SqueezeCalculoService, SqueezeWellContext } from './squeeze-calculo.service';
import { SqueezeInputs } from '../models/squeeze.model';
import { BBL_M, HYDRO_M } from '../models/constantes';
import { createSqueezeSchematicModel } from '../components/charts/squeeze-schematics.component';
import { SqueezeHydraulicSimulation } from '../models/squeeze.model';

const well: SqueezeWellContext = {
  interval: { topMD: 1950, bottomMD: 2050 },
  geometry: {
    finalMD: 2500, finalTVD: 2050,
    phases: [
      { id: 'cased', name: 'Revestido', type: 'INTERMEDIATE',
        topMD: 0, bottomMD: 2000, topTVD: 0, bottomTVD: 1800,
        holeDiameterIn: 12.25, casing: { odIn: 9.625, idIn: 8.835, bottomMD: 2000 } },
      { id: 'open', name: 'Aberto', type: 'OPEN_HOLE',
        topMD: 2000, bottomMD: 2500, topTVD: 1800, bottomTVD: 2050, holeDiameterIn: 8.5 },
    ],
  },
};
const inputs: SqueezeInputs = {
  sectionStartMD: 1400, sectionEndMD: 1500, sectionStartTVD: 1400, sectionEndTVD: 1500,
  wellFinalMD: 1500, wellFinalTVD: 1500,
  caliper: 8.535, casingOD: 5.5, casingID: 4.778, tubingOD: 2.875, tubingID: 2.441,
  backSpacerHeight: 30, mudWeightFront: 8.4, mudWeightBack: 8.4, completionWeight: 9,
  fracGrad: 16, poreGrad: 9, pumpRate: 2, surfaceTemp: 80.6, geoGradient: 1.5,
  density: 15.8, expectedLoss: 2, pressaoOperacao: 400,
};
const perfs = [{ top: 2020, base: 2040 }];
const service = new SqueezeCalculoService(new CoreCalculoService());
const upperCap = BBL_M * 8.835 ** 2;
const lowerCap = BBL_M * 8.5 ** 2;
const pipeCap = BBL_M * inputs.tubingID ** 2;
const steelCap = BBL_M * (inputs.tubingOD ** 2 - inputs.tubingID ** 2);
const geometricVolume = 50 * upperCap + 50 * lowerCap;

// Solução analítica para as duas fases desta fixture, ancorada em 2050 m.
function expectedTop(volume: number, steel = 0): number {
  const belowShoe = 50 * (lowerCap - steel);
  return volume <= belowShoe
    ? 2050 - volume / (lowerCap - steel)
    : 2000 - (volume - belowShoe) / (upperCap - steel);
}

describe('Squeeze com múltiplas fases', () => {
  it('usa o intervalo e o fundo do poço cadastrado, somando os volumes por fase', () => {
    const geom = service.calcVolumes(inputs, perfs, null, well);
    expect(geom.top).toBe(1950);
    expect(geom.base).toBe(2050);
    expect(geom.wellFinalMD).toBe(2500);
    expect(geom.wellFinalTVD).toBe(2050);
    // O tampão é o bombeado; os 2 bbl a injetar saem dele (SPEC squeeze-tampao §2.1).
    expect(geom.slurryTotal).toBeCloseTo(geometricVolume, 9);
    expect(geom.slurryPhysicalVolumeBbl).toBeCloseTo(geometricVolume - 2, 9);
    expect(geom.cID).toBe(8.5);
    expect(geom.cOD).toBe(0);
  });

  it.each([null, 3, 20])('calcula os quatro topos atravessando a sapata (volume=%s)', override => {
    // Pasta bombeada: o tampão do intervalo, de onde saem os 2 bbl a injetar; o volume
    // informado já é o bombeado.
    const volume = override ?? geometricVolume;
    const geom = service.calcVolumes(inputs, perfs, override, well);
    expect(geom.slurryTotal).toBeCloseTo(volume, 9);
    expect(geom.slurryPhysicalVolumeBbl).toBeCloseTo(volume - 2, 9);
    expect(geom.topCementAfterPullMD).toBeCloseTo(expectedTop(volume), 9);
    expect(geom.topCementImmersedMD).toBeCloseTo(expectedTop(volume, steelCap), 9);
    // Depois da injeção fica o bombeado menos os 2 bbl injetados.
    expect(geom.topCementAfterInjectionMD).toBeCloseTo(expectedTop(volume - 2), 9);
    expect(geom.topCementImmersedAfterInjectionMD).toBeCloseTo(expectedTop(volume - 2, steelCap), 9);
    if (override === null) expect(geom.topCementAfterPullMD).toBeCloseTo(1950, 9);
    expect(geom.cementPhysicalTopMD).toBeCloseTo(expectedTop(volume - 2), 9);
    expect(geom.cementPhysicalBaseMD).toBe(2050);
    expect(geom.cementHeightWithTubing).toBeCloseTo(2050 - expectedTop(volume, steelCap), 9);
    expect(geom.cementVolumeTubingBbl).toBeCloseTo(pipeCap * geom.cementHeightWithTubing, 9);
    expect(geom.cementVolumeTubingBbl! + geom.cementVolumeAnnulusBbl!).toBeCloseTo(volume, 9);
  });

  it('integra o espaçador da frente quando ele atravessa a sapata', () => {
    const geom = service.calcVolumes(inputs, perfs, 5, well);
    const cementTop = expectedTop(5, steelCap);
    const frontTop = cementTop - 30;
    expect(frontTop).toBeLessThan(2000);
    expect(cementTop).toBeGreaterThan(2000);
    const pipeOuterCap = BBL_M * inputs.tubingOD ** 2;
    const expectedFront = (2000 - frontTop) * (upperCap - pipeOuterCap)
      + (cementTop - 2000) * (lowerCap - pipeOuterCap);
    expect(geom.frontPhysicalVolumeBbl).toBeCloseTo(expectedFront, 9);
    expect(geom.volBackSpacer).toBeCloseTo(30 * pipeCap, 9);
    expect(geom.displacementVolume).toBeCloseTo(frontTop * pipeCap, 9);
    const allFluids = 5 + expectedFront + 30 * pipeCap + geom.displacementVolume;
    expect(geom.topDisplacementAfterPullMD).toBeCloseTo(expectedTop(allFluids), 9);
  });

  it('preserva o deslocamento manual', () => {
    const geom = service.calcVolumes({ ...inputs, volumeDeslocamentoBbl: 7 }, perfs, null, well);
    expect(geom.displacementVolume).toBe(7);
  });

  it.each([[2000, 8.835], [2000.001, 8.5], [2500, 8.5]])('resolve capacidade na base %s', (bottomMD, diameter) => {
    const geom = service.calcVolumes(inputs, perfs, null, { ...well, interval: { topMD: 1950, bottomMD } });
    expect(geom.finalCapacity_m).toBeCloseTo(BBL_M * diameter ** 2, 9);
  });

  it('usa TVD de cada fase na pressão estática, inclusive acima do intervalo da operação', () => {
    const geom = service.calcVolumes(inputs, perfs, null, well);
    const result = service.calcFractureGradient(geom, inputs, well);
    const deepTVD = 1800 + 40 * 0.5;
    // Com a coluna imersa, a pasta inteira bombeada (o tampão do intervalo).
    const cementTVD = expectedTop(geometricVolume, steelCap) * 0.9;
    const backTVD = cementTVD - 30 * 0.9;
    expect(result.fracPsi).toBeCloseTo(HYDRO_M * 16 * deepTVD, 9);
    expect(result.porePsi).toBeCloseTo(HYDRO_M * 9 * deepTVD, 9);
    expect(result.squeezePsi).toBeCloseTo(400 + HYDRO_M * (
      9 * backTVD + 8.4 * (cementTVD - backTVD) + 15.8 * (deepTVD - cementTVD)
    ), 9);
  });

  it('desenha os topos calculados sem refazer a divisão pela capacidade da base', () => {
    const geom = service.calcVolumes(inputs, perfs, null, well);
    const simulation = { summary: { topPerfMD: 2020, basePerfMD: 2040, referenceMD: 2030 } } as SqueezeHydraulicSimulation;
    const model = createSqueezeSchematicModel('withTubing', geom, simulation);
    expect(model.tubingSegments.at(-1)?.top).toBeCloseTo(expectedTop(geometricVolume, steelCap), 9);
    expect(model.annulusSegments.at(-1)?.top).toBeCloseTo(expectedTop(geometricVolume, steelCap), 9);
    expect(model.tubingSegments.at(-1)?.bottom).toBe(2050);
    const without = createSqueezeSchematicModel('withoutTubing', geom, simulation);
    // Depois da retirada e antes da compressão: o tampão inteiro, no topo do intervalo.
    expect(without.segments.at(-1)?.top).toBeCloseTo(expectedTop(geometricVolume), 9);
    expect(without.segments.at(-1)?.top).toBeCloseTo(1950, 9);
    expect(without.segments.find(s => s.key === 'displacementFluid')?.top).toBe(geom.topDisplacementAfterPullMD);
  });

  it('mantém o caminho de seção única quando não recebe contexto de poço', () => {
    const geom = service.calcVolumes(inputs, [{ top: 1420, base: 1440 }]);
    const capacity = BBL_M * inputs.casingID ** 2;
    expect(geom.base).toBe(1500);
    expect(geom.slurryTotal).toBeCloseTo(capacity * 100, 9);
    expect(geom.slurryPhysicalVolumeBbl).toBeCloseTo(capacity * 100 - 2, 9);
    expect(geom.topCementImmersedMD).toBeCloseTo(1500 - capacity * 100 / (capacity - steelCap), 9);
  });
});
