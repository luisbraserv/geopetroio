import { describe, expect, it } from 'vitest';
import { CoreCalculoService } from './core-calculo.service';
import { SqueezeCalculoService } from './squeeze-calculo.service';
import { SqueezeInputs } from '../models/squeeze.model';
import { BBL_M } from '../models/constantes';

describe('SqueezeCalculoService', () => {
  const service = new SqueezeCalculoService(new CoreCalculoService());

  it('calcula o deslocamento do cenario SMC-29 pelo topo da agua atras', () => {
    const inputs: SqueezeInputs = {
      sectionStartMD: 1543,
      sectionEndMD: 1607,
      sectionStartTVD: 1197,
      sectionEndTVD: 2148.5,
      wellFinalMD: 1500,
      wellFinalTVD: 1500,
      caliper: 8.535,
      casingOD: 5.5,
      casingID: 4.778,
      tubingOD: 2.875,
      tubingID: 2.441,
      backSpacerHeight: 158,
      mudWeightFront: 8.4,
      mudWeightBack: 8.4,
      completionWeight: 8.4,
      fracGrad: 16,
      poreGrad: 9,
      pumpRate: 2,
      surfaceTemp: 80.6,
      geoGradient: 1.84,
      surfacePressure: 0,
      squeezeTestPressure: 400,
      expectedLoss: 2,
    };

    const geom = service.calcVolumes(inputs, [
      { top: 1568, base: 1570 },
      { top: 1593, base: 1602 },
    ]);

    // Altura do cimento balanceado com a coluna imersa (anular + interior da coluna)
    const capWithTubing = geom.annulusCasing_m + geom.tubingID_m;
    // A pasta inteira bombeada (intervalo + a injetar) está no poço no posicionamento.
    expect(geom.cementHeightWithTubing).toBeCloseTo(geom.slurryTotal / capWithTubing, 6);
    expect(geom.topCementImmersedMD).toBeCloseTo(geom.base - geom.cementHeightWithTubing, 6);

    // Água atrás empilhada sobre o topo do cimento imerso; deslocamento até o topo dela
    const topBackSpacer = geom.topCementImmersedMD - inputs.backSpacerHeight;
    expect(geom.operationalDisplacementVolumeBbl).toBeCloseTo(geom.tubingID_m * topBackSpacer, 6);
    // 26,2 bbl equilibrando só a pasta do intervalo; com os 2 bbl a injetar equilibrados junto,
    // o topo sobe 2 / (Can + Ctp) e o deslocamento cai Ctp · 2 / (Can + Ctp).
    expect(geom.operationalDisplacementVolumeBbl).toBeCloseTo(25.58, 2);
    expect(geom.displacementVolume).toBeCloseTo(geom.operationalDisplacementVolumeBbl, 6);
  });

  it('7-PIR-259D-AL, squeeze 1: 72 m de 7" 23 lb/pé + 2 bbl a injetar = 11,3 bbl, topo a 1470 m depois da injeção', () => {
    // Programa 109/2026 §9.50: extremidade a 1542 m, "topo esperado do cimento: 1470,0 m (após
    // injeção de 2 bbl de pasta)"; recursos §11: squeeze 1 com 11,0 bbl.
    const geom = service.calcVolumes({
      sectionStartMD: 1470, sectionEndMD: 1542, sectionStartTVD: 1421.4, sectionEndTVD: 1486.4,
      wellFinalMD: 1880, wellFinalTVD: 1791.4, caliper: 8.5, casingOD: 7, casingID: 6.366,
      tubingOD: 2.875, tubingID: 2.441, backSpacerHeight: 50, mudWeightFront: 8.4, mudWeightBack: 8.4,
      completionWeight: 8.4, fracGrad: 16, poreGrad: 9, pumpRate: 2, surfaceTemp: 80.6, geoGradient: 1.5,
      surfacePressure: 0, squeezeTestPressure: 0, expectedLoss: 2,
    } as SqueezeInputs, [{ top: 1508, base: 1513.5 }, { top: 1515, base: 1521 }]);
    const capacity = BBL_M * 6.366 ** 2;
    expect(geom.slurryPhysicalVolumeBbl).toBeCloseTo(72 * capacity, 9);
    expect(geom.slurryPhysicalVolumeBbl).toBeCloseTo(9.30, 2);
    expect(geom.slurryTotal).toBeCloseTo(11.30, 2);
    expect(geom.topCementAfterInjectionMD).toBeCloseTo(1470, 9);
    expect(geom.topCementAfterPullMD).toBeCloseTo(1470 - 2 / capacity, 9);
    expect(geom.cementPhysicalTopMD).toBeCloseTo(1470, 9);
  });
});
