import { describe, expect, it } from 'vitest';
import { CoreCalculoService } from './core-calculo.service';
import { SqueezeCalculoService } from './squeeze-calculo.service';
import { SqueezeInputs } from '../models/squeeze.model';

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
    expect(geom.cementHeightWithTubing).toBeCloseTo(geom.slurryPhysicalVolumeBbl / capWithTubing, 6);
    expect(geom.topCementImmersedMD).toBeCloseTo(geom.base - geom.cementHeightWithTubing, 6);

    // Água atrás empilhada sobre o topo do cimento imerso; deslocamento até o topo dela
    const topBackSpacer = geom.topCementImmersedMD - inputs.backSpacerHeight;
    expect(geom.operationalDisplacementVolumeBbl).toBeCloseTo(geom.tubingID_m * topBackSpacer, 6);
    expect(geom.operationalDisplacementVolumeBbl).toBeCloseTo(26.2, 1);
    expect(geom.displacementVolume).toBeCloseTo(geom.operationalDisplacementVolumeBbl, 6);
  });
});
