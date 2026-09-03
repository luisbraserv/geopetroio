import { describe, expect, it } from 'vitest';
import { CoreCalculoService } from './core-calculo.service';
import { RheologyAdjustmentService } from './rheology-adjustment.service';
import { SlurryCalculoService } from './slurry-calculo.service';
import { Aditivo } from '../models/aditivo.model';
import { CementSlurryRecipeService } from './cement-slurry-recipe.service';

describe('SlurryCalculoService additive calculations', () => {
  const service = new SlurryCalculoService(new CoreCalculoService(), new RheologyAdjustmentService(), new CementSlurryRecipeService());

  it('calculates percent BWOC additive mass and absolute volume', () => {
    const additive: Aditivo = {
      name: 'Sílica teste',
      category: 'silica',
      type: 'solid',
      conc: 35,
      unidadeDosagem: 'percentBWOC',
      volumeAbsolutoGalPerLb: 0.0453,
    };

    const calc = service.getAdditiveCalcs([additive])[0];

    expect(calc.wt).toBeCloseTo(94 * 0.35, 6);
    expect(calc.vol).toBeCloseTo(94 * 0.35 * 0.0453, 6);
  });

  it('calculates liquid gal/sk additive mass from density', () => {
    const additive: Aditivo = {
      name: 'Líquido teste',
      category: 'antifoam',
      type: 'liquid',
      conc: 0.5,
      unidadeDosagem: 'galPerSack',
      densidadeLbGal: 9,
    };

    const calc = service.getAdditiveCalcs([additive])[0];

    expect(calc.vol).toBe(0.5);
    expect(calc.wt).toBe(4.5);
  });

  it('does not generate invalid values when physical data is missing', () => {
    const additive: Aditivo = {
      name: 'Sem dados',
      category: 'other',
      type: 'solid',
      conc: 1,
      unidadeDosagem: 'lbPerBbl',
    };

    const calc = service.getAdditiveCalcs([additive], { slurryBblPerSk: 0 })[0];

    expect(Number.isFinite(calc.wt)).toBe(true);
    expect(Number.isFinite(calc.vol)).toBe(true);
  });
});
