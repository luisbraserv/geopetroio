import { describe, expect, it } from 'vitest';
import { RheologyAdjustmentService } from './rheology-adjustment.service';
import { Aditivo } from '../models/aditivo.model';

describe('RheologyAdjustmentService', () => {
  const service = new RheologyAdjustmentService();

  it('uses a generic profile when only additive function/category is available', () => {
    const additive: Aditivo = {
      name: 'Dispersante sem ensaio',
      category: 'dispersant',
      type: 'liquid',
      conc: 0.1,
      afetaReologia: true,
      modeloReologico: 'empirical',
    };

    const result = service.applyAdditiveRheologyEffects({ plasticViscosityCp: 70, yieldPointLbf100ft2: 30 }, [additive]);

    expect(result.rheology.plasticViscosityCp).toBe(61);
    expect(result.rheology.yieldPointLbf100ft2).toBe(18);
    expect(result.confidence).toBe('estimated');
    expect(result.source).toBe('estimado');
    expect(result.operationalEffects?.positivo.some(e => e.parametro === 'pv' && e.direcao === 'reduz')).toBe(true);
  });

  it('applies empirical coefficients inside the additive data', () => {
    const additive: Aditivo = {
      name: 'Aditivo com coeficiente',
      category: 'viscosifier',
      type: 'solid',
      conc: 2,
      afetaReologia: true,
      coefficients: {
        pvDeltaPerUnit: 3,
        ypDeltaPerUnit: 1.5,
      },
    };

    const result = service.applyAdditiveRheologyEffects({ plasticViscosityCp: 40, yieldPointLbf100ft2: 20 }, [additive]);

    expect(result.rheology.plasticViscosityCp).toBe(52);
    expect(result.rheology.yieldPointLbf100ft2).toBe(31);
    expect(result.confidence).toBe('estimated');
  });

  it('uses Fann readings when they are registered', () => {
    const additive: Aditivo = {
      name: 'Colchao ensaiado',
      category: 'washerAdditive',
      type: 'liquid',
      conc: 0.6,
      afetaReologia: true,
      modeloReologico: 'fannReadings',
      rpm300: 180,
      rpm100: 70,
    };

    const result = service.applyAdditiveRheologyEffects({}, [additive]);

    expect(result.rheology.plasticViscosityCp).toBe(110);
    expect(result.rheology.yieldPointLbf100ft2).toBe(70);
    expect(result.confidence).toBe('measured');
  });
});
