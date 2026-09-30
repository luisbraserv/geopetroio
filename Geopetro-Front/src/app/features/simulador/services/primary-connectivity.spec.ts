import { describe, expect, it } from 'vitest';
import { primaryContractExample } from '../models/primary-cementing.examples';
import { buildWellGeometry } from '../models/well-geometry.form';
import type { PrimaryScenario } from '../models/primary-scenario.model';
import type { PrimaryDeviceConnectionState } from '../models/primary-cementing.model';
import { primaryInitialDeviceStates } from './primary-connectivity';
import { WellGeometryService } from './well-geometry.service';

describe('primary device connectivity and conserved inventory', () => {
  const service = new WellGeometryService();
  const well = (s: PrimaryScenario) => buildWellGeometry(s.wellFinalMD, s.wellFinalTVD, s.fases);
  const resolve = (s: PrimaryScenario, states = primaryInitialDeviceStates(s.primary), stage: string | null = 'stage-1') =>
    service.resolvePrimaryConnectivity(well(s), s.primary, states, stage);
  const closeCollar = (s: PrimaryScenario) => primaryInitialDeviceStates(s.primary).map(state =>
    state.deviceId === 'collar' ? { ...state, internalPassage: 'closed' as const } : state);

  it.each(['conventional', 'liner'] as const)('orders the entire %s flow from head down to shoe and back through the annulus', kind => {
    const s = primaryContractExample(kind);
    const result = resolve(s);
    expect(result.issues).toEqual([]);
    expect(result.circulation).toBe('open');
    expect(result.cells.every(c => c.connectivity === 'circulating')).toBe(true);
    const flow = result.flowCellIds.map(id => result.cells.find(c => c.id === id)!);
    const returning = flow.findIndex(c => c.zone === 'casing-annulus');
    expect(flow.slice(0, returning).every(c => c.zone === 'internal')).toBe(true);
    expect(flow[0].topMD).toBe(0);
    expect(flow[returning].bottomMD).toBe(s.primary.target!.shoeMD);
    expect(flow.at(-1)!.topMD).toBe(0);
    const geom = service.resolvePrimaryStageGeometry(well(s), s.primary);
    expect(flow.reduce((sum, c) => sum + c.volumeBbl, 0)).toBeCloseTo(
      geom.inventoryCapacities!.internalBbl + geom.inventoryCapacities!.annularBbl, 9);
  });

  it('closing the collar stops circulation without isolating the shoe track from the annulus', () => {
    const s = primaryContractExample('conventional');
    const result = resolve(s, closeCollar(s));
    expect(result.issues).toEqual([]);
    expect(result.circulation).toBe('blocked');
    expect(result.flowCellIds).toEqual([]);
    const track = result.cells.filter(c => c.zone === 'internal' && c.topMD >= 1470);
    expect(track.length).toBeGreaterThan(0);
    expect(track.every(c => c.connectivity === 'static-connected' && c.pressureBoundaries.join() === 'return')).toBe(true);
    const upper = result.cells.filter(c => c.zone === 'internal' && c.bottomMD <= 1470);
    expect(upper.every(c => c.pressureBoundaries.join() === 'head')).toBe(true);
  });

  it('opens the second circuit and keeps deeper branches static with every cell ID and volume preserved', () => {
    const s = primaryContractExample('two-stage');
    const first = resolve(s);
    const states = closeCollar(s);
    states.find(d => d.deviceId === 'port')!.outlet = 'open';
    const before = structuredClone({ s, states });
    const second = resolve(s, states, 'stage-2');
    expect(second.issues).toEqual([]);
    expect(second.circulation).toBe('open');
    expect(second.cells.filter(c => c.topMD >= 1000).every(c => c.connectivity === 'static-connected')).toBe(true);
    expect(second.cells.filter(c => c.connectivity === 'circulating').every(c => c.bottomMD <= 1000)).toBe(true);
    expect(second.cells.map(c => [c.id, c.volumeBbl])).toEqual(first.cells.map(c => [c.id, c.volumeBbl]));
    expect({ s, states }).toEqual(before);
  });

  it('identifies trapped internal liquid between two closed seats without guessing its pressure', () => {
    const s = primaryContractExample('two-stage');
    const states = closeCollar(s);
    states.find(d => d.deviceId === 'port')!.internalPassage = 'closed';
    const result = resolve(s, states, null);
    const trapped = result.cells.filter(c => c.zone === 'internal' && c.topMD >= 970 && c.bottomMD <= 1470);
    expect(result.circulation).toBe('idle');
    expect(trapped.length).toBeGreaterThan(0);
    expect(trapped.every(c => c.connectivity === 'isolated' && c.pressureBoundaries.length === 0)).toBe(true);
    expect(result.cells.filter(c => c.zone === 'casing-annulus').every(c => c.pressureBoundaries.join() === 'return')).toBe(true);
  });

  it('locates seat cavities on the declared side and retains their inventory after closing', () => {
    const s = primaryContractExample('two-stage');
    s.primary.retainedVolumes.push(
      { id: 'above-seat', kind: 'accessory', assemblyId: 'target', zone: 'internal', md: 970, volumeBbl: 2, connectionSide: 'shallower' },
      { id: 'below-seat', kind: 'accessory', assemblyId: 'target', zone: 'internal', md: 970, volumeBbl: 3, connectionSide: 'deeper' },
    );
    const open = resolve(s);
    const states = closeCollar(s);
    states.find(d => d.deviceId === 'port')!.internalPassage = 'closed';
    const closed = resolve(s, states, null);
    expect(closed.issues).toEqual([]);
    expect(closed.cells.find(c => c.accessoryId === 'above-seat')).toMatchObject({ volumeBbl: 2, pressureBoundaries: ['head'] });
    expect(closed.cells.find(c => c.accessoryId === 'below-seat')).toMatchObject({ volumeBbl: 3, connectivity: 'isolated' });
    expect(closed.cells.map(c => [c.id, c.volumeBbl])).toEqual(open.cells.map(c => [c.id, c.volumeBbl]));
  });

  it('does not sweep a cavity on the deeper side of the active outlet', () => {
    const s = primaryContractExample('two-stage');
    s.primary.retainedVolumes.push(
      { id: 'above-port', kind: 'accessory', assemblyId: 'target', zone: 'casing-annulus', md: 1000, volumeBbl: 2, connectionSide: 'shallower' },
      { id: 'below-port', kind: 'accessory', assemblyId: 'target', zone: 'casing-annulus', md: 1000, volumeBbl: 3, connectionSide: 'deeper' },
    );
    const states = closeCollar(s); states.find(d => d.deviceId === 'port')!.outlet = 'open';
    const result = resolve(s, states, 'stage-2');
    expect(result.issues).toEqual([]);
    expect(result.cells.find(c => c.accessoryId === 'above-port')!.connectivity).toBe('circulating');
    expect(result.cells.find(c => c.accessoryId === 'below-port')!.connectivity).toBe('static-connected');
    const annularFlow = result.cells.filter(c => c.zone === 'casing-annulus' && c.connectivity === 'circulating').reduce((sum, c) => sum + c.volumeBbl, 0);
    const stage = service.resolvePrimaryStageGeometry(well(s), s.primary).stages[1];
    expect(annularFlow).toBeCloseTo(stage.annularToReturnBbl, 9);
  });

  it('rejects two simultaneously fed outlets instead of picking a convenient path', () => {
    const s = primaryContractExample('two-stage');
    const states = primaryInitialDeviceStates(s.primary); states.find(d => d.deviceId === 'port')!.outlet = 'open';
    const result = resolve(s, states);
    expect(result.issues.some(i => i.code === 'PRIMARY_MULTIPLE_OUTLETS')).toBe(true);
    expect(result.circulation).toBe('invalid');
    expect(result.cells).toEqual([]);
  });

  it('requires complete explicit device states and the correct active stage', () => {
    const s = primaryContractExample('two-stage');
    expect(resolve(s, []).issues.some(i => i.code === 'PRIMARY_DEVICE_STATE')).toBe(true);
    const states = primaryInitialDeviceStates(s.primary);
    states.push({ ...states[0] });
    expect(resolve(s, states).circulation).toBe('invalid');
    expect(resolve(s, primaryInitialDeviceStates(s.primary), 'missing').circulation).toBe('invalid');
    expect(resolve(s, primaryInitialDeviceStates(s.primary), 'stage-2').issues.some(i => i.code === 'PRIMARY_ACTIVE_OUTLET_MISMATCH')).toBe(true);
  });

  it('does not interpret a closed float outlet as an isolated shoe track', () => {
    const s = primaryContractExample('conventional');
    const states: PrimaryDeviceConnectionState[] = [{ deviceId: 'collar', internalPassage: 'closed', outlet: 'closed' }];
    expect(resolve(s, states).issues.some(i => i.code === 'PRIMARY_FLOAT_CONNECTION')).toBe(true);
  });
});
