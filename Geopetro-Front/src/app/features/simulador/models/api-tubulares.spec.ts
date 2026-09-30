import { describe, expect, it } from 'vitest';
import { API_CASING_SIZES } from './api-tubulares';

describe('API_CASING_SIZES', () => {
  it('includes the API casing sizes above 16 inches through 20 inches', () => {
    expect(API_CASING_SIZES.filter(casing => casing.odIn > 16)).toEqual([
      { odIn: 18.625, weightLbFt: 87.50, idIn: 17.755 },
      { odIn: 20.000, weightLbFt: 94.00, idIn: 19.124 },
      { odIn: 20.000, weightLbFt: 106.50, idIn: 19.000 },
      { odIn: 20.000, weightLbFt: 133.00, idIn: 18.730 },
    ]);
  });
});
