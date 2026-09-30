import { describe, expect, it } from 'vitest';
import type { PrimaryFluid, PrimarySnapshot } from './primary-cementing.model';
import type { PrimaryGeometrySegment } from './primary-geometry.model';
import { primaryOverlays } from './primary-overlays';

const fluids: PrimaryFluid[] = (['mud', 'spacer', 'cement', 'displacement'] as const).map(kind => ({
  id: kind, kind, name: kind, densityPpg: 10,
  rheology: { model: 'power-law', n: 1, kLbfSnFt2: 0.00002 }, propertySources: {},
}));

const segment = (topMD: number, bottomMD: number): PrimaryGeometrySegment => ({
  id: `s-${topMD}`, equipmentId: 'target', phaseId: 'open', topMD, bottomMD,
  topTVD: topMD, bottomTVD: bottomMD, casingIDIn: 6.276, casingODIn: 7,
  outerBoundary: 'open-hole', outerBoundaryId: 'outer-hole', outerDiameterIn: 8.5,
  pipeCapacityBblM: 0.1255, annularCapacityBblM: 0.0741, nominalAnnularCapacityBblM: 0.0741,
  diameterSource: 'nominal', excessFraction: 0,
});

const parcel = (fluidId: string, zone: PrimarySnapshot['parcels'][number]['zone'],
  topMD: number, bottomMD: number): PrimarySnapshot['parcels'][number] => ({
  fluidId, assemblyId: 'target', zone, topMD, bottomMD, volumeBbl: 1, connectivity: 'static-connected',
});

const snapshot = (parcels: PrimarySnapshot['parcels']): PrimarySnapshot => ({
  timeMin: 0, stageId: 'stage-1', activePathId: 'path', parcels, devices: [], plugs: [],
  inventory: [], profiles: [],
});

describe('primary parcels as drawing overlays (P7)', () => {
  const segments = [segment(0, 500), segment(500, 1500)];

  it('keeps mud out of the drawing so the operation stays readable', () => {
    const overlays = primaryOverlays(snapshot([
      parcel('mud', 'casing-annulus', 0, 500),
      parcel('cement', 'casing-annulus', 500, 1500),
    ]), fluids, segments);
    expect(overlays).toHaveLength(1);
    expect(overlays[0].type).toBe('CEMENT');
    expect(overlays[0].topMD).toBe(500);
  });

  it('carries the radial limits of the annulus, so cement sits outside the casing', () => {
    const overlays = primaryOverlays(snapshot([parcel('cement', 'casing-annulus', 500, 1500)]),
      fluids, segments);
    expect(overlays[0].zone).toBe('casing-annulus');
    expect(overlays[0].outerDiameterIn).toBe(8.5);
    expect(overlays[0].innerDiameterIn).toBe(7);
  });

  it('marks internal cement as inside the casing without radial limits of the annulus', () => {
    const overlays = primaryOverlays(snapshot([parcel('cement', 'internal', 1480, 1500)]),
      fluids, segments);
    expect(overlays[0].zone).toBe('tubing');
    expect(overlays[0].sub).toBe('interior do revestimento');
    expect(overlays[0].outerDiameterIn).toBeUndefined();
  });

  it('merges neighbouring parcels of the same fluid into one band', () => {
    const overlays = primaryOverlays(snapshot([
      parcel('cement', 'casing-annulus', 500, 900),
      parcel('cement', 'casing-annulus', 900, 1500),
    ]), fluids, segments);
    expect(overlays).toHaveLength(1);
    expect(overlays[0].bottomMD).toBe(1500);
  });

  it('does not merge across zones or across a different fluid', () => {
    const overlays = primaryOverlays(snapshot([
      parcel('cement', 'casing-annulus', 500, 900),
      parcel('spacer', 'casing-annulus', 900, 1000),
      parcel('cement', 'casing-annulus', 1000, 1500),
    ]), fluids, segments);
    expect(overlays.map(o => o.type)).toEqual(['CEMENT', 'SPACER', 'CEMENT']);
  });

  it('returns nothing without a snapshot', () => {
    expect(primaryOverlays(null, fluids, segments)).toEqual([]);
  });
});
