import { describe, expect, it } from 'vitest';
import { CementSlurryRecipeService } from './cement-slurry-recipe.service';
import { SlurryDesign } from '../models/pasta.model';
import { VOL_WATER_FRESH } from '../models/constantes';
import { SlurryCalculoService } from './slurry-calculo.service';
import { CoreCalculoService } from './core-calculo.service';
import { RheologyAdjustmentService } from './rheology-adjustment.service';

const service = new CementSlurryRecipeService();

function slurryWithBaseVolume(totalVolumeGal: number): SlurryDesign {
  const cementClassCv = 3.5908;
  const waterVolumeGal = totalVolumeGal - cementClassCv;
  return {
    density: 15.8,
    yieldFt3: totalVolumeGal / (1728 / 231),
    yieldLPerSk: totalVolumeGal / (1728 / 231) * 28.3168,
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
    expect(base.yieldFt3PerFt3Cement).toBeCloseTo(8.6764 / (1728 / 231), 6);
  });

  it('scales recipe by volume using yield', () => {
    const volume = service.calculateRecipeByVolume(slurryWithBaseVolume(8.6764), 10);
    const expectedYield = 8.6764 / (1728 / 231);
    const expectedFt3 = 10 * 42 * 231 / 1728;
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

  it('conserves absolute volume and component mass when scaling a composition', () => {
    const slurry = slurryWithBaseVolume(8.6764);
    slurry.waterSeaLb = 10;
    slurry.silicaWt = 32.9;
    slurry.naclLb = 1.2;
    const base = service.calculateRecipeBase(slurry);
    const volume = service.calculateRecipeByVolume(slurry, 12);
    const mass = volume.rows.reduce((sum, row) => sum + row.scaledMassLb!, 0);
    const gal = volume.rows.reduce((sum, row) => sum + row.scaledVolumeGal!, 0);
    expect(gal).toBeCloseTo(12 * 42, 10);
    expect(mass / gal).toBeCloseTo(base.densityPpg, 10);
    expect(base.totalMassLb).toBeCloseTo(94 + slurry.waterFreshLb + 10 + 32.9 + 1.2, 10);
    expect(volume.totalMixWaterGal).toBeCloseTo(
      volume.rows.filter(r => r.type === 'water').reduce((sum, r) => sum + r.scaledVolumeGal!, 0), 10);
  });

  it('preserves water-dependent additives and does not mutate the supplied design', () => {
    const slurry = slurryWithBaseVolume(8.6764);
    slurry.adds = [{ name: 'BWOW', type: 'solid', category: 'other', conc: 2,
      dosageUnit: 'percentBWOW', wt: 0.846, vol: 0.04, absoluteVolumeGal: 0.04 }];
    const original = structuredClone(slurry);
    Object.freeze(slurry.adds[0]);
    const first = service.buildSlurryRecipe(8, slurry);
    const second = service.buildSlurryRecipe(8, slurry);
    expect(slurry).toEqual(original);
    expect(second).toEqual(first);
    expect(first.baseRecipe!.rows.find(r => r.productName === 'BWOW')!.baseMassLb).toBe(0.846);
  });

  it('keeps the recipe consistent with a design generated by the slurry engine', () => {
    const calc = new SlurryCalculoService(new CoreCalculoService(), new RheologyAdjustmentService(), service);
    const slurry = calc.calculateSlurryDesign({ density: 15.8, cementClass: 'G',
      waterSplitFresh: 70, waterSplitSea: 30, silica: 35, nacl: 2,
      bhct: 100, bhst: 120, surfaceTemp: 80,
      additivos: [{ name: 'Sal teste', category: 'salt', type: 'solid', conc: 2,
        unidadeDosagem: 'percentBWOW', volumeAbsolutoGalPerLb: 0.042 } as any] });
    const original = structuredClone(slurry);
    const recipe = service.buildSlurryRecipe(10, slurry);
    expect(recipe.error).toBeUndefined();
    expect(recipe.baseRecipe!.densityPpg).toBeCloseTo(15.8, 8);
    expect(recipe.baseRecipe!.yieldFt3PerFt3Cement).toBeCloseTo(slurry.yieldFt3, 10);
    expect(recipe.baseRecipe!.facGpc).toBeCloseTo(slurry.facGpc, 10);
    expect(recipe.baseRecipe!.famGpc).toBeCloseTo(slurry.famGpc, 10);
    expect(slurry).toEqual(original);
  });

  it.each([-1, NaN, Infinity])('rejects invalid target volume %s without offering a fallback recipe', target => {
    const recipe = service.buildSlurryRecipe(target, slurryWithBaseVolume(8.6764));
    expect(recipe.error).toBeTruthy();
    expect(recipe.recipeItems).toEqual([]);
    expect(recipe.sacks).toBe(0);
  });

  it.each([0, -1, NaN, Infinity])('rejects an explicitly invalid yield override %s', yieldOverride => {
    const recipe = service.buildSlurryRecipe(10, slurryWithBaseVolume(8.6764), yieldOverride);
    expect(recipe.error).toBeTruthy();
    expect(recipe.recipeItems).toEqual([]);
  });

  it.each([-1, NaN, Infinity])('rejects invalid component mass %s even with a valid yield override', waterFreshLb => {
    const slurry = { ...slurryWithBaseVolume(8.6764), waterFreshLb };
    const recipe = service.buildSlurryRecipe(10, slurry, 1.2);
    expect(recipe.error).toBeTruthy();
    expect(recipe.recipeItems).toEqual([]);
    expect(service.buildSlurryRecipeByFacFam(slurry, 10, 5, 5, 1.2).error).toBeTruthy();
  });

  it('returns zero quantities for zero volume in automatic and manual recipes', () => {
    const slurry = slurryWithBaseVolume(8.6764);
    const automatic = service.buildSlurryRecipe(0, slurry);
    const manual = service.buildSlurryRecipeByFacFam(slurry, 0, 5, 5, 1.2);
    expect(automatic.error).toBeUndefined();
    expect(manual.error).toBeUndefined();
    expect(automatic.recipeItems.every(row => row.total === 0)).toBe(true);
    expect(manual.rows.every(row => row.scaledMassLb === 0 && row.scaledVolumeGal === 0)).toBe(true);
  });

  it('uses the same volume conversion for automatic and manual recipes', () => {
    const slurry = slurryWithBaseVolume(8.6764);
    const base = service.calculateRecipeBase(slurry);
    const automatic = service.calculateRecipeByVolume(slurry, 10);
    const manual = service.buildSlurryRecipeByFacFam(slurry, 10, base.facGpc, base.famGpc, base.yieldFt3PerFt3Cement);
    expect(manual.targetSlurryVolumeFt3).toBeCloseTo(10 * 42 * 231 / 1728, 10);
    expect(manual.rows).toEqual(automatic.rows);
  });
});
