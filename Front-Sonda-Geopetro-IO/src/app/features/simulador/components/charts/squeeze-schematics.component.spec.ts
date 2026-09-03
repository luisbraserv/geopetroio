import { describe, expect, it } from 'vitest';
import { createSqueezeSchematicModel } from './squeeze-schematics.component';
import { computeVisualSegmentHeights } from './visual-segments';
import { SqueezeGeometry, SqueezeHydraulicSimulation } from '../../models/squeeze.model';

const geom = {
  top: 1400,
  base: 1500,
  wellFinalMD: 1500,
  finalCapacity_m: 0.5,
  tubingID_m: 0.025,
  annulusCasing_m: 0.06,
  operationalDisplacementVolumeBbl: 10,
  displacementVolume: 10,
  volBackSpacer: 2,
  backPhysicalVolumeBbl: 2,
  backPhysicalHeight: 20,
  frontPhysicalVolumeBbl: 3,
  frontPhysicalHeight: 30,
  washVolFront: 3,
  slurryTotal: 8,
  slurryPumpedVolumeBbl: 8,
  slurryPhysicalVolumeBbl: 6,
  cementHeightWithoutTubing: 80,
  cementPhysicalHeight: 80,
  workVolumeBbl: 6,
} as SqueezeGeometry;

const simulation = {
  summary: {
    topPerfMD: 1420,
    basePerfMD: 1440,
    referenceMD: 1430,
  },
} as SqueezeHydraulicSimulation;

describe('createSqueezeSchematicModel', () => {
  it('does not draw perforations in the with tubing schematic', () => {
    const model = createSqueezeSchematicModel('withTubing', geom, simulation);
    expect(model.topPerfMD).toBe(1420);
    expect(model.basePerfMD).toBe(1440);
    expect(model.showTubing).toBe(true);
    expect(model.hasPerforations).toBe(false);
  });

  it('shows perforations in the without tubing schematic without drawing tubing', () => {
    const model = createSqueezeSchematicModel('withoutTubing', geom, simulation);
    expect(model.topPerfMD).toBe(1420);
    expect(model.basePerfMD).toBe(1440);
    expect(model.showTubing).toBe(false);
    expect(model.hasPerforations).toBe(true);
  });

  it('covers exactly the perforated interval as squeeze zone', () => {
    const model = createSqueezeSchematicModel('withTubing', geom, simulation);
    expect(model.topPerfMD).toBe(1420);
    expect(model.basePerfMD).toBe(1440);
  });

  it('draws formation and casing in both schematic modes', () => {
    const withTubing = createSqueezeSchematicModel('withTubing', geom, simulation);
    const withoutTubing = createSqueezeSchematicModel('withoutTubing', geom, simulation);
    expect(withTubing.showFormation).toBe(true);
    expect(withTubing.showCasing).toBe(true);
    expect(withoutTubing.showFormation).toBe(true);
    expect(withoutTubing.showCasing).toBe(true);
  });

  it('uses two independent columns in squeeze with tubing', () => {
    const model = createSqueezeSchematicModel('withTubing', geom, simulation);
    expect(model.lanes).toEqual(['Dentro do tubing', 'Anular / poço']);
    expect(model.tubingSegments.length).toBeGreaterThan(0);
    expect(model.annulusSegments.length).toBeGreaterThan(0);
  });

  it('orders tubing as displacement, back water and cement', () => {
    const model = createSqueezeSchematicModel('withTubing', geom, simulation);
    expect(model.tubingSegments.map(segment => segment.key)).toEqual(['displacementFluid', 'backWater', 'cementTubing']);
    expect(model.tubingSegments.some(segment => segment.key === 'frontWater')).toBe(false);
    expect(model.tubingSegments.some(segment => segment.key === 'completionFluid')).toBe(false);
    expect(model.tubingSegments[1].bottom).toBe(model.tubingSegments[2].top);
    expect(model.tubingSegments.at(-1)?.key).toBe('cementTubing');
  });

  it('orders annulus as completion fluid, front water and annular cement', () => {
    const model = createSqueezeSchematicModel('withTubing', geom, simulation);
    expect(model.annulusSegments.map(segment => segment.key)).toEqual(['completionFluid', 'frontWater', 'cementAnnulus']);
    expect(model.annulusSegments.some(segment => segment.key === 'backWater')).toBe(false);
    expect(model.annulusSegments[1].bottom).toBe(model.annulusSegments[2].top);
    expect(model.annulusSegments.at(-1)?.key).toBe('cementAnnulus');
  });

  it('merges displacement + front/back spacers into a single displacement fluid (without tubing)', () => {
    const model = createSqueezeSchematicModel('withoutTubing', geom, simulation);
    expect(model.segments.map(segment => segment.key)).toEqual(['completionFluid', 'displacementFluid', 'cement']);
    const displacement = model.segments.find(segment => segment.key === 'displacementFluid')!;
    expect(displacement.name).toBe('Deslocamento');
  });

  it('keeps without tubing segment boundaries available for height references', () => {
    const model = createSqueezeSchematicModel('withoutTubing', geom, simulation);
    const displacement = model.segments.find(segment => segment.key === 'displacementFluid')!;
    const cement = model.segments.find(segment => segment.key === 'cement')!;

    expect(displacement.top).toBeLessThan(displacement.bottom);
    expect(cement.top).toBe(displacement.bottom);
    expect(cement.bottom).toBe(geom.base);
  });

  it('uses the real perforation depths in the with tubing schematic', () => {
    const model = createSqueezeSchematicModel('withTubing', geom, simulation);
    expect(model.topPerfMD).toBe(simulation.summary.topPerfMD);
    expect(model.basePerfMD).toBe(simulation.summary.basePerfMD);
  });

  it('keeps tubing segment real depth references available for height annotations', () => {
    const model = createSqueezeSchematicModel('withTubing', geom, simulation);
    const [displacement, backWater, cement] = model.tubingSegments;
    expect(displacement.top).toBeLessThan(displacement.bottom);
    expect(backWater.top).toBe(displacement.bottom);
    expect(cement.top).toBe(backWater.bottom);
    expect(cement.bottom).toBe(simulation.summary.referenceMD);
  });

  it('gives cement 40 percent visual height independently in tubing and annulus', () => {
    const model = createSqueezeSchematicModel('withTubing', geom, simulation);
    const tubingVisual = computeVisualSegmentHeights(
      model.tubingSegments.map(segment => ({
        key: segment.key === 'cementTubing' ? 'cement' : segment.key,
        top: segment.top,
        bottom: segment.bottom,
      })),
      { totalVisualHeight: 500, cementKey: 'cement', cementVisualRatio: 0.4 },
    );
    const annulusVisual = computeVisualSegmentHeights(
      model.annulusSegments.map(segment => ({
        key: segment.key === 'cementAnnulus' ? 'cement' : segment.key,
        top: segment.top,
        bottom: segment.bottom,
      })),
      { totalVisualHeight: 500, cementKey: 'cement', cementVisualRatio: 0.4 },
    );

    expect(tubingVisual.find(segment => segment.key === 'cement')?.visualHeight).toBeCloseTo(200, 6);
    expect(annulusVisual.find(segment => segment.key === 'cement')?.visualHeight).toBeCloseTo(200, 6);
  });
});
