import { ReverseCirculationCalculoService } from './reverse-circulation-calculo.service';

describe('ReverseCirculationCalculoService', () => {
  const service = new ReverseCirculationCalculoService();

  it('calcula circulacao reversa pelo volume interno da coluna', () => {
    const result = service.calculateReverseCirculation({
      tubingIdIn: 2.441,
      openEndDepthM: 1351,
    });

    expect(result.tubingCapacityBblPerM).toBeCloseTo(0.0190, 4);
    expect(result.internalTubingVolumeBbl).toBeCloseTo(25.7, 1);
    expect(result.reverseCirculationVolumeBbl).toBeCloseTo(38.5, 1);
    expect(result.safetyFactor).toBe(1.5);
  });

  it('valida entradas positivas', () => {
    expect(() => service.calculateReverseCirculation({ tubingIdIn: 0, openEndDepthM: 1351 })).toThrow();
    expect(() => service.calculateReverseCirculation({ tubingIdIn: 2.441, openEndDepthM: 0 })).toThrow();
    expect(() => service.calculateReverseCirculation({ tubingIdIn: 2.441, openEndDepthM: 1351, safetyFactor: 0 })).toThrow();
  });
});
