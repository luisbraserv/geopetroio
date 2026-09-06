import { describe, expect, it } from 'vitest';
import { WellSchematicComponent } from './well-schematic.component';
import { WellGeometry, WellOverlay } from '../../models/well-geometry.model';

const well: WellGeometry = {
  finalMD: 2500,
  finalTVD: 2350,
  phases: [
    {
      id: 'p1', name: 'Fase 26"', type: 'CONDUCTOR',
      topMD: 0, bottomMD: 400, topTVD: 0, bottomTVD: 400,
      holeDiameterIn: 26,
      casing: { odIn: 20, idIn: 18.73, bottomMD: 400 },
      shoe: { md: 400, tvd: 400 },
    },
    {
      id: 'p2', name: 'Fase 12 1/4"', type: 'INTERMEDIATE',
      topMD: 400, bottomMD: 2000, topTVD: 400, bottomTVD: 1880,
      holeDiameterIn: 12.25,
      casing: { odIn: 9.625, idIn: 8.835, bottomMD: 2000 },
      shoe: { md: 2000, tvd: 1880 },
    },
    {
      id: 'p3', name: 'Fase 8 1/2"', type: 'OPEN_HOLE',
      topMD: 2000, bottomMD: 2500, topTVD: 1880, bottomTVD: 2350,
      holeDiameterIn: 8.5,
    },
  ],
};

const build = (geometry: WellGeometry, overlays: WellOverlay[] = [], mode: 'schematic' | 'proportional' = 'schematic') => {
  const component = new WellSchematicComponent();
  component.geometry = geometry;
  component.overlays = overlays;
  component.scaleMode = mode;
  component.ngOnChanges();
  return component;
};

describe('WellSchematicComponent', () => {
  it('draws one contiguous band per phase, from surface downwards', () => {
    const component = build(well);
    expect(component.bands.map(b => b.phase.id)).toEqual(['p1', 'p2', 'p3']);
    expect(component.bands[0].y0).toBe(component.topPad);
    for (let i = 1; i < component.bands.length; i += 1) {
      expect(component.bands[i].y0).toBeCloseTo(component.bands[i - 1].y1, 6);
    }
  });

  it('keeps a short phase legible in schematic mode', () => {
    const shallow: WellGeometry = {
      ...well,
      phases: [
        { ...well.phases[0], bottomMD: 12, bottomTVD: 12, casing: { odIn: 20, idIn: 18.73, bottomMD: 12 }, shoe: { md: 12, tvd: 12 } },
        { ...well.phases[1], topMD: 12, topTVD: 12 },
        well.phases[2],
      ],
    };
    const schematic = build(shallow, [], 'schematic');
    const proportional = build(shallow, [], 'proportional');
    const heightOf = (c: WellSchematicComponent) => c.bands[0].y1 - c.bands[0].y0;
    expect(heightOf(proportional)).toBeLessThan(4);
    expect(heightOf(schematic)).toBeGreaterThan(20);
  });

  it('uses depth-proportional heights in proportional mode', () => {
    const component = build(well, [], 'proportional');
    const [first, second] = component.bands.map(b => b.y1 - b.y0);
    // 400 m contra 1600 m
    expect(second / first).toBeCloseTo(4, 1);
  });

  it('narrows the drawing as the diameters reduce', () => {
    const component = build(well);
    const [wide, medium, narrow] = component.bands.map(b => b.halfHole);
    expect(wide).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(narrow);
  });

  it('marks one shoe per cased phase with its real depths', () => {
    const component = build(well);
    expect(component.shoes.map(s => s.md)).toEqual([400, 2000]);
    expect(component.shoes[1]).toMatchObject({ label: '9 5/8"', tvd: 1880 });
  });

  it('positions overlays inside the phase they belong to', () => {
    const component = build(well, [
      { type: 'CEMENT', topMD: 1900, bottomMD: 2100, label: 'Pasta de cimento', zone: 'full' },
    ]);
    const [shape] = component.overlayShapes;
    const phase2 = component.bands.find(b => b.phase.id === 'p2')!;
    const phase3 = component.bands.find(b => b.phase.id === 'p3')!;
    expect(shape.y).toBeGreaterThan(phase2.y0);
    expect(shape.y).toBeLessThan(phase2.y1);
    expect(shape.y + shape.height).toBeLessThanOrEqual(phase3.y1);
  });

  it('does not invent a position for an overlay outside the well', () => {
    const component = build(well, [
      { type: 'CEMENT', topMD: 2600, bottomMD: 2700, label: 'Fora do poço' },
    ]);
    expect(component.overlayShapes).toEqual([]);
  });

  it('renders nothing when there are no phases', () => {
    const component = build({ finalMD: 1000, finalTVD: 1000, phases: [] });
    expect(component.bands).toEqual([]);
  });
});
