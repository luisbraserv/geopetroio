import { describe, expect, it } from 'vitest';
import { CementSlurryRecipeService } from './cement-slurry-recipe.service';
import { SlurryDesign } from '../models/pasta.model';
import { VOL_WATER_FRESH } from '../models/constantes';

const service = new CementSlurryRecipeService();

function slurryWithBaseVolume(totalVolumeGal: number): SlurryDesign {
  const cementClassCv = 3.5908;
  const waterVolumeGal = totalVolumeGal - cementClassCv;
  return {
    density: 15.8,
    yieldFt3: totalVolumeGal / 7.4805,
    yieldLPerSk: totalVolumeGal / 7.4805 * 28.3168,
    fam: waterVolumeGal,
    fac: 0,
    famGalPerSk: waterVolumeGal,
    facPct: 0,
    famGpc: waterVolumeGal,
    facGpc: waterVolumeGal,
    waterVolumeGal,
    waterFreshLb: waterVolumeGal / VOL_WATER_FRESH,
    waterSeaLb: 0,
    naclLb: 0,
    retarder: 0,
    accelerator: 0,
    dispersant: 0,
    fluidLoss: 0,
    silica: 0,
    surfacePressure: 0,
    bhct: 0,
    bhst: 0,
    cementClassCv,
    cementClassLabel: 'G',
    silicaWt: 0,
    adds: [],
    _effects: { retarder: 0, accelerator: 0, dispersant: 0, fluidLoss: 0, ttShift: 0, slopeModifier: 0, t30Extra: 0, t100Extra: 0, tempSensTotal: 0, ucaOnsetMod: 0, ucaStrengthMod: 0, freeWaterMod: 0 },
    _thickeningPressureWeightId: 'mudWeightFront',
    _thickeningChartFallbackWhenZero: true,
  };
}

describe('CementSlurryRecipeService', () => {
  it('calculates base recipe yield from total base volume', () => {
    const base = service.calculateRecipeBase(slurryWithBaseVolume(8.6764));
    expect(base.yieldFt3PerFt3Cement).toBeCloseTo(8.6764 / 7.4805, 6);
  });

  it('scales recipe by volume using yield', () => {
    const volume = service.calculateRecipeByVolume(slurryWithBaseVolume(8.6764), 10);
    const expectedYield = 8.6764 / 7.4805;
    const expectedFt3 = 10 * 5.614583;
    expect(volume.targetSlurryVolumeFt3).toBeCloseTo(expectedFt3, 6);
    expect(volume.cementVolumeFt3).toBeCloseTo(expectedFt3 / expectedYield, 6);
    expect(volume.sacks94lb).toBeCloseTo(volume.cementVolumeFt3, 6);
  });

  it('returns identical recipes for tampao and squeeze with the same slurry and volume', () => {
    const slurry = slurryWithBaseVolume(8.6764);
    const tampao = service.buildSlurryRecipe(7.5, slurry);
    const squeeze = service.buildSlurryRecipe(7.5, slurry);
    expect(squeeze.baseRecipe).toEqual(tampao.baseRecipe);
    expect(squeeze.volumeRecipe).toEqual(tampao.volumeRecipe);
  });

  it('calculates base recipe before volume recipe even when design yield is missing', () => {
    const slurry = { ...slurryWithBaseVolume(8.6764), yieldFt3: null as any, yieldFt3PerFt3Cement: null as any };
    const volume = service.calculateRecipeByVolume(slurry, 10);
    expect(volume.error).toBeUndefined();
    expect(volume.sacks94lb).toBeGreaterThan(0);
  });

  it('blocks volume recipe when yield cannot be calculated', () => {
    const slurry = { ...slurryWithBaseVolume(0), cementClassCv: 0, waterFreshLb: 0, waterSeaLb: 0, adds: [] };
    const volume = service.calculateRecipeByVolume(slurry, 10);
    expect(volume.error).toBe('Não foi possível calcular a receita por volume porque o rendimento da pasta não foi calculado.');
  });

  it('multiplies every component by the same scale factor', () => {
    const volume = service.calculateRecipeByVolume(slurryWithBaseVolume(8.6764), 10);
    for (const row of volume.rows) {
      expect(row.scaledMassLb).toBeCloseTo(row.baseMassLb * volume.scaleFactor, 6);
      expect(row.scaledVolumeGal).toBeCloseTo(row.baseVolumeGal * volume.scaleFactor, 6);
    }
  });

  it('scales solid BWOC, liquid gpc and salt BWOW from their base rows', () => {
    const slurry = slurryWithBaseVolume(8.6764);
    slurry.naclLb = slurry.waterFreshLb * 0.02;
    slurry.adds = [
      { name: 'Sólido BWOC', type: 'solid', category: 'other', conc: 10, dosageUnit: 'percentBWOC', wt: 9.4, vol: 0.47, absoluteVolumeGal: 0.47 },
      { name: 'Líquido gpc', type: 'liquid', category: 'other', conc: 0.5, dosageUnit: 'galPerSack', wt: 4.5, vol: 0.5, absoluteVolumeGal: 0.5 },
    ];

    const volume = service.calculateRecipeByVolume(slurry, 5);
    const solid = volume.rows.find(row => row.productName === 'Sólido BWOC')!;
    const liquid = volume.rows.find(row => row.productName === 'Líquido gpc')!;
    const salt = volume.rows.find(row => row.productName === 'NaCl')!;

    expect(solid.scaledMassLb).toBeCloseTo(9.4 * volume.scaleFactor, 6);
    expect(liquid.scaledVolumeGal).toBeCloseTo(0.5 * volume.scaleFactor, 6);
    expect(salt.scaledMassLb).toBeCloseTo(slurry.naclLb * volume.scaleFactor, 6);
  });
});
