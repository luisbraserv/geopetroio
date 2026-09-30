import { describe, expect, it } from 'vitest';
import { WellGeometry } from '../models/well-geometry.model';
import { WellGeometryService } from './well-geometry.service';
import { distributeFluids, HydraulicFluid, pumpedParcels } from './well-fluid-distribution';
import { BBL_M } from '../models/constantes';

const well: WellGeometry = { finalMD: 200, finalTVD: 80, phases: [
  { id: 'a', name: 'Inclinado', type: 'OPEN_HOLE', topMD: 0, bottomMD: 100, topTVD: 0, bottomTVD: 80, holeDiameterIn: 4 },
  { id: 'b', name: 'Horizontal', type: 'OPEN_HOLE', topMD: 100, bottomMD: 200, topTVD: 80, bottomTVD: 80, holeDiameterIn: 6 },
] };
const geo = new WellGeometryService();
const segments = geo.getGeometrySegments(well, 0, 200);
const light: HydraulicFluid = { densityPpg: 10, rheo: { n: 1, k: 0.001 } };
const heavy: HydraulicFluid = { densityPpg: 16, rheo: { n: 0.5, k: 0.01 } };

describe('Distribuição dos fluidos por volume em MD', () => {
  it('desce na coluna usando MD e preserva as interfaces em TVD', () => {
    const cap = BBL_M * 2 ** 2;
    const slices = distributeFluids(segments, () => cap, [{ volumeBbl: cap * 150, fluid: heavy }],
      light, 'down', md => geo.mdToTvd(well, md));
    expect(slices.map(s => [s.topMD, s.bottomMD, s.topTVD, s.bottomTVD, s.fluid.densityPpg])).toEqual([
      [0, 100, 0, 80, 16], [100, 150, 80, 80, 16], [150, 200, 80, 80, 10],
    ]);
    expect(slices.filter(s => s.fluid === heavy).reduce((sum, s) => sum + (s.bottomMD - s.topMD) * cap, 0)).toBeCloseTo(cap * 150, 10);
  });

  it('sobe pelo anular atravessando diâmetros distintos, conservando volume', () => {
    const lowCap = BBL_M * (6 ** 2 - 2 ** 2);
    const highCap = BBL_M * (4 ** 2 - 2 ** 2);
    const volume = lowCap * 100 + highCap * 25;
    const slices = distributeFluids(segments, geo.capacityResolver({ kind: 'annulus', pipeOD: 2 }),
      [{ volumeBbl: volume, fluid: heavy }], light, 'up', md => geo.mdToTvd(well, md));
    expect(slices.map(s => [s.topMD, s.bottomMD, s.fluid.densityPpg])).toEqual([
      [0, 75, 10], [75, 100, 16], [100, 200, 16],
    ]);
    const placed = slices.filter(s => s.fluid === heavy).reduce((sum, s) =>
      sum + BBL_M * (s.innerDiameterIn ** 2 - 4) * (s.bottomMD - s.topMD), 0);
    expect(placed).toBeCloseTo(volume, 10);
  });

  it('mantém a ordem dos fluidos e limita a parcela ao volume já bombeado', () => {
    const parcels = pumpedParcels([{ ...light, volumeBbl: 5 }, { ...heavy, volumeBbl: 10 }], 8);
    expect(parcels.map(p => [p.volumeBbl, p.fluid.densityPpg])).toEqual([[3, 16], [5, 10]]);
  });

  it('rejeita anular sem capacidade, sem descartar trechos silenciosamente', () => {
    expect(() => distributeFluids(segments, () => 0, [], light, 'up',
      md => geo.mdToTvd(well, md))).toThrow('coluna');
  });
});
