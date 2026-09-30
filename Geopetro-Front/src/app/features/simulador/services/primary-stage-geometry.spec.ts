import { describe, expect, it } from 'vitest';
import { primaryContractExample } from '../models/primary-cementing.examples';
import { buildWellGeometry } from '../models/well-geometry.form';
import type { PrimaryScenario } from '../models/primary-scenario.model';
import { WellGeometryService } from './well-geometry.service';

describe('liner assembly and stage circuit geometry (P3)', () => {
  const service = new WellGeometryService();
  const resolve = (s: PrimaryScenario) => service.resolvePrimaryStageGeometry(
    buildWellGeometry(s.wellFinalMD, s.wellFinalTVD, s.fases), s.primary);

  it('uses the setting string above liner top and liner ID/OD below it', () => {
    const scenario = primaryContractExample('liner');
    const before = structuredClone(scenario);
    const result = resolve(scenario);
    expect(result.issues).toEqual([]);
    const upper = result.fullGeometry.segments.filter(s => s.bottomMD <= 1000);
    const lower = result.fullGeometry.segments.filter(s => s.topMD >= 1000);
    expect(upper.every(s => s.equipmentId === 'setting' && s.casingIDIn === 4 && s.casingODIn === 5)).toBe(true);
    expect(lower.every(s => s.equipmentId === 'target' && s.casingIDIn === 6 && s.casingODIn === 7)).toBe(true);
    expect(result.fullGeometry.capacities!.shoeTrackBbl).toBeCloseTo(3.442068, 9);
    expect(service.primaryVolumeBetween(result.fullGeometry.segments, 'casing-annulus', 0, 1000)).toBeCloseTo(178.4776, 9);
    expect(scenario).toEqual(before);
  });

  it('counts dart and wiper travel once, with the specified liner displacement', () => {
    const result = resolve(primaryContractExample('liner'));
    const stage = result.stages[0];
    expect(stage.displacementBbl).toBeCloseTo(162.287132, 9);
    expect(stage.dartTravelBbl).toBeCloseTo(50.9936, 9);
    expect(stage.wiperTravelBbl).toBeCloseTo(111.293532, 9);
    expect(stage.dartTravelBbl! + stage.wiperTravelBbl!).toBeCloseTo(stage.displacementBbl, 10);
  });

  it('keeps the first-stage track below a later port instead of dropping its geometry', () => {
    const result = resolve(primaryContractExample('two-stage'));
    expect(result.issues).toEqual([]);
    expect(result.stages).toHaveLength(2);
    const [first, second] = result.stages;
    expect(first.outletMD).toBe(1500);
    expect(first.nonCirculatingSegments).toEqual([]);
    expect(second.outletMD).toBe(1000);
    expect(second.seatMD).toBe(970);
    expect(second.segments.at(-1)!.bottomMD).toBe(1000);
    expect(second.nonCirculatingSegments[0].topMD).toBe(1000);
    expect(second.nonCirculatingSegments.at(-1)!.bottomMD).toBe(1500);
    expect(second.displacementBbl).toBeCloseTo(0.1255340557296 * 970, 9);
    const retained = service.primaryVolumeBetween(second.nonCirculatingSegments, 'internal', 1000, 1500);
    expect(second.internalToOutletBbl + retained).toBeCloseTo(result.fullGeometry.capacities!.internalBbl, 9);
  });

  it('accepts a third stage without hard-coding a two-stage limit', () => {
    const s = primaryContractExample('two-stage');
    s.primary.devices.push({ id: 'port-3', name: 'Terceira porta', kind: 'stage-tool', assemblyId: 'target',
      outletMD: 600, seatMD: 570, launchMD: 0, initialState: 'closed' });
    s.primary.paths.push({ id: 'path-3', name: 'Terceiro circuito', legs: [
      { id: 'in-3', zone: 'internal', assemblyId: 'target', topMD: 0, bottomMD: 600, direction: 'down' },
      { id: 'out-3', zone: 'casing-annulus', assemblyId: 'target', topMD: 0, bottomMD: 600, direction: 'up' },
    ] });
    s.primary.stages[1].targetTocMD = 600;
    s.primary.stages[1].placements[0].topMD = 600;
    s.primary.stages.push({ id: 'stage-3', name: 'Estágio 3', deviceId: 'port-3', outletMD: 600,
      seatMD: 570, targetTocMD: 0, activePathId: 'path-3', placements: [], steps: [] });
    const result = resolve(s);
    expect(result.issues).toEqual([]);
    expect(result.stages.map(st => st.outletMD)).toEqual([1500, 1000, 600]);
  });

  it('rejects missing setting string coverage instead of extending the liner to surface', () => {
    const s = primaryContractExample('liner');
    s.primary.assemblies.find(a => a.id === 'setting')!.sections[0].bottomMD = 900;
    const result = resolve(s);
    expect(result.issues.some(i => i.code === 'PRIMARY_SETTING_STRING')).toBe(true);
    expect(result.stages).toEqual([]);
    expect(result.fullGeometry.capacities).toBeNull();
  });

  it('rejects wrong assembly or flow direction in a declared path', () => {
    const s = primaryContractExample('liner');
    s.primary.paths[0].legs[0].assemblyId = 'target';
    expect(resolve(s).issues.some(i => i.code === 'PRIMARY_PATH_ASSEMBLY')).toBe(true);
    s.primary.paths[0].legs[0].assemblyId = 'setting';
    s.primary.paths[0].legs[0].direction = 'up';
    expect(resolve(s).issues.some(i => i.code === 'PRIMARY_PATH_CONTINUITY')).toBe(true);
  });

  it('rejects discontinuous return and a stage with a mismatched device seat', () => {
    const s = primaryContractExample('two-stage');
    s.primary.paths[1].legs[1].topMD = 50;
    expect(resolve(s).issues.some(i => i.code === 'PRIMARY_PATH_RETURN')).toBe(true);
    s.primary.paths[1].legs[1].topMD = 0;
    s.primary.stages[1].seatMD = 960;
    expect(resolve(s).issues.some(i => i.code === 'PRIMARY_STAGE_DEVICE_DEPTH')).toBe(true);
  });

  it('includes accessory cavities once while keeping tubular capacities distinct', () => {
    const s = primaryContractExample('conventional');
    const baseline = resolve(s);
    s.primary.retainedVolumes.push({ id: 'cavity', kind: 'accessory', assemblyId: 'target', zone: 'internal', md: 200, volumeBbl: 1 });
    const result = resolve(s);
    expect(result.issues).toEqual([]);
    expect(result.fullGeometry.capacities!.internalBbl).toBeCloseTo(baseline.fullGeometry.capacities!.internalBbl, 10);
    expect(result.inventoryCapacities!.internalBbl).toBeCloseTo(baseline.inventoryCapacities!.internalBbl + 1, 10);
    expect(result.stages[0].displacementBbl).toBeCloseTo(baseline.stages[0].displacementBbl + 1, 10);
    expect(result.stages[0].accessoryIds).toEqual(['cavity']);
  });

  it('allocates hanger-boundary cavities to dart or wiper travel by their assembly', () => {
    const s = primaryContractExample('liner');
    s.primary.retainedVolumes.push(
      { id: 'string-cavity', kind: 'accessory', assemblyId: 'setting', zone: 'internal', md: 1000, volumeBbl: 2 },
      { id: 'liner-cavity', kind: 'accessory', assemblyId: 'target', zone: 'internal', md: 1000, volumeBbl: 3 },
      { id: 'track-cavity', kind: 'accessory', assemblyId: 'target', zone: 'internal', md: 1970, volumeBbl: 4, connectionSide: 'deeper' },
    );
    const result = resolve(s);
    expect(result.issues).toEqual([]);
    expect(result.stages[0].dartTravelBbl).toBeCloseTo(52.9936, 9);
    expect(result.stages[0].wiperTravelBbl).toBeCloseTo(114.293532, 9);
    expect(result.stages[0].displacementBbl).toBeCloseTo(167.287132, 9);
    expect(result.inventoryCapacities!.shoeTrackBbl).toBeCloseTo(7.442068, 9);
  });

  it('keeps deeper cavities in the inventory when a shallower stage circulates', () => {
    const s = primaryContractExample('two-stage');
    const baseline = resolve(s);
    s.primary.retainedVolumes.push(
      { id: 'lower-in', kind: 'accessory', assemblyId: 'target', zone: 'internal', md: 1200, volumeBbl: 2 },
      { id: 'lower-out', kind: 'accessory', assemblyId: 'target', zone: 'casing-annulus', md: 1200, volumeBbl: 3 },
    );
    const result = resolve(s);
    expect(result.issues).toEqual([]);
    expect(result.stages[1].nonCirculatingAccessoryIds).toEqual(['lower-in', 'lower-out']);
    expect(result.stages[1].displacementBbl).toBeCloseTo(baseline.stages[1].displacementBbl, 10);
    expect(result.stages[0].annularToReturnBbl).toBeCloseTo(baseline.stages[0].annularToReturnBbl + 3, 10);
  });

  it.each([-1, 0, NaN, Infinity])('rejects invalid cavity volume %s without a partial inventory', volumeBbl => {
    const s = primaryContractExample('conventional');
    s.primary.retainedVolumes.push({ id: 'invalid', kind: 'accessory', assemblyId: 'target', zone: 'internal', md: 200, volumeBbl });
    const result = resolve(s);
    expect(result.issues.some(i => i.code === 'PRIMARY_ACCESSORY_VALUE')).toBe(true);
    expect(result.inventoryCapacities).toBeNull();
    expect(result.stages).toEqual([]);
  });

  it('requires an explicit side at a seat and rejects an accessory outside its assembly', () => {
    const s = primaryContractExample('conventional');
    s.primary.retainedVolumes.push({ id: 'seat-volume', kind: 'accessory', assemblyId: 'target', zone: 'internal', md: 1470, volumeBbl: 1 });
    expect(resolve(s).issues.some(i => i.code === 'PRIMARY_ACCESSORY_LOCATION')).toBe(true);
    s.primary.retainedVolumes[1].assemblyId = 'previous';
    expect(resolve(s).inventoryCapacities).toBeNull();
  });

  it('does not accept an invented track or duplicate retained-volume IDs', () => {
    const s = primaryContractExample('conventional');
    s.primary.retainedVolumes.push({ ...s.primary.retainedVolumes[0] });
    expect(resolve(s).issues.some(i => i.code === 'PRIMARY_RETAINED_ID')).toBe(true);
    s.primary.retainedVolumes.pop();
    const track = s.primary.retainedVolumes[0];
    if (track.kind !== 'shoe-track') throw Error('fixture');
    track.topMD = 1400;
    expect(resolve(s).issues.some(i => i.code === 'PRIMARY_TRACK_GEOMETRY')).toBe(true);
  });
});
