import { describe, expect, it } from 'vitest';
import { WellSpatialPath } from './well-spatial-path';
import { WellGeometry } from '../models/well-geometry.model';

const well = (): WellGeometry => ({
  finalMD: 1500, finalTVD: 1200,
  phases: [{ id: 'p1', name: 'Produção', type: 'PRODUCTION', topMD: 0, bottomMD: 1500,
    topTVD: 0, bottomTVD: 1200, holeDiameterIn: 8.5, shoe: { md: 1300, tvd: 1040 } }],
});

describe('well spatial coordinates', () => {
  it('uses a declared vertical MD schematic without inventing an azimuth from manual TVDs', () => {
    const geometry = well();
    const original = structuredClone(geometry);
    const path = new WellSpatialPath(geometry);
    expect(path.mode).toBe('schematic');
    expect(path.at(1500)).toEqual({ md: 1500, tvd: 1500, north: 0, east: 0 });
    expect(geometry).toEqual(original);
  });
  it('uses the existing analytic curvature with north/east orientation and intermediate MD positions', () => {
    const geometry = well();
    geometry.trajectory = { stations: [
      { md: 0, inclinationDeg: 0, azimuthDeg: 90 },
      { md: 1500, inclinationDeg: 90, azimuthDeg: 90 },
    ] };
    const path = new WellSpatialPath(geometry);
    const radius = 3000 / Math.PI;
    expect(path.mode).toBe('survey');
    expect(path.at(1500).east).toBeCloseTo(radius, 7);
    expect(path.at(1500).tvd).toBeCloseTo(radius, 7);
    expect(path.at(750).tvd).toBeCloseTo(radius * Math.sin(Math.PI / 4), 7);
    expect(path.at(750).east).toBeCloseTo(radius * (1 - Math.cos(Math.PI / 4)), 7);
    expect(path.at(750).north).toBeCloseTo(0, 7);
  });
  it('keeps phase/shoe boundaries and stops at TD when the survey extends beyond the well', () => {
    const geometry = well();
    geometry.trajectory = { stations: [
      { md: 0, inclinationDeg: 0, azimuthDeg: 0 },
      { md: 2000, inclinationDeg: 45, azimuthDeg: 0 },
    ] };
    const path = new WellSpatialPath(geometry);
    const samples = path.samples();
    expect(samples[0].md).toBe(0);
    expect(samples.at(-1)!.md).toBe(1500);
    expect(samples.some(s => s.md === 1300)).toBe(true);
    expect(samples.every((s, i) => i === 0 || s.md > samples[i - 1].md)).toBe(true);
    expect(() => path.at(1501)).toThrow();
  });
  it('rejects invalid survey and invalid geometry rather than drawing a fallback trajectory', () => {
    const geometry = well();
    geometry.trajectory = { stations: [] };
    expect(() => new WellSpatialPath(geometry)).toThrow('Survey');
    delete geometry.trajectory;
    geometry.phases[0].holeDiameterIn = -1;
    expect(() => new WellSpatialPath(geometry)).toThrow();
  });
});
