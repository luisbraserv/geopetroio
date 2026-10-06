import type { PrimaryFluid, PrimaryPumpStep, PrimaryTubularAssembly } from './primary-cementing.model';
import { createPrimaryDraft, PrimaryScenario } from './primary-scenario.model';

/** Exemplos de contrato, não operações calculadas nem projetos aprovados. */
export function primaryContractExample(kind: 'conventional' | 'liner' | 'two-stage'): PrimaryScenario {
  const s = createPrimaryDraft();
  const liner = kind === 'liner';
  const shoe = liner ? 2000 : 1500;
  const top = liner ? 1000 : 0;
  const previousShoe = liner ? 1200 : 300;
  const collar = shoe - 30;
  const tubular = (id: string, role: PrimaryTubularAssembly['role'], topMD: number,
    bottomMD: number, idIn: number, odIn: number): PrimaryTubularAssembly => ({
    id, name: id, role, sections: [{ id: `${id}-section`, topMD, bottomMD, idIn, odIn }],
  });
  s.wellFinalMD = s.wellFinalTVD = shoe;
  s.fases = [
    { id: 'surface', name: 'Superfície', type: 'SURFACE', topMD: 0, topTVD: 0,
      bottomMD: previousShoe, bottomTVD: previousShoe, holeDiameterIn: 12.25,
      casingOD: 9.625, casingID: liner ? 9 : 8.535, shoeMD: previousShoe, shoeTVD: previousShoe },
    { id: 'open', name: 'Poço aberto', type: 'OPEN_HOLE', topMD: previousShoe,
      topTVD: previousShoe, bottomMD: shoe, bottomTVD: shoe, holeDiameterIn: 8.5,
      casingOD: null, casingID: null, shoeMD: null, shoeTVD: null },
  ];
  const p = s.primary;
  p.assemblies = [
    tubular('target', 'target-casing', top, shoe, liner ? 6 : 6.276, 7),
    tubular('previous', 'previous-casing', 0, previousShoe, liner ? 9 : 8.535, 9.625),
    ...(liner ? [tubular('setting', 'setting-string', 0, top, 4, 5)] : []),
  ];
  const target = { casingAssemblyId: 'target', floatCollarMD: collar, shoeMD: shoe };
  p.target = liner ? { ...target, kind: 'liner', linerTopMD: top, settingStringAssemblyId: 'setting' }
    : { ...target, kind: 'conventional' };
  p.outerBoundaries = [
    { id: 'outer-previous', kind: 'previous-casing', topMD: 0, bottomMD: previousShoe, assemblyId: 'previous' },
    { id: 'outer-hole', kind: 'open-hole', topMD: previousShoe, bottomMD: shoe,
      phaseId: 'open', diameter: { source: 'nominal', excessFraction: 0 } },
  ];
  const makeFluid = (id: string, kind: PrimaryFluid['kind'], densityPpg: number): PrimaryFluid => ({
    id, name: id, kind, densityPpg,
    rheology: { model: 'power-law', n: 1, kLbfSnFt2: 0.000020885 },
    propertySources: { densityPpg: { source: 'entered' }, n: { source: 'entered' }, kLbfSnFt2: { source: 'entered' } },
  });
  p.fluids = [makeFluid('mud', 'mud', 10), makeFluid('cement', 'cement', 16), makeFluid('displacement', 'displacement', 9)];
  p.initialFluidId = 'mud';
  p.paths = [{ id: 'shoe-path', name: 'Circulação pela sapata', legs: [
    ...(liner ? [{ id: 'setting-in', zone: 'internal' as const, assemblyId: 'setting', topMD: 0, bottomMD: top, direction: 'down' as const }] : []),
    { id: 'target-in', zone: 'internal', assemblyId: 'target', topMD: top, bottomMD: shoe, direction: 'down' },
    { id: 'target-out', zone: 'casing-annulus', assemblyId: 'target', topMD: top, bottomMD: shoe, direction: 'up' },
    ...(liner ? [{ id: 'setting-out', zone: 'casing-annulus' as const, assemblyId: 'setting', topMD: 0, bottomMD: top, direction: 'up' as const }] : []),
  ] }];
  p.devices = [{ id: 'collar', name: 'Colar', kind: 'float-collar', assemblyId: 'target',
    outletMD: shoe, seatMD: collar, launchMD: 0, initialState: 'open' }];
  if (liner) p.devices.push({ id: 'hanger', name: 'Topo do liner', kind: 'liner-hanger', assemblyId: 'target',
    outletMD: top, seatMD: top, launchMD: 0, initialState: 'open' });
  p.retainedVolumes = [{ id: 'track', kind: 'shoe-track', assemblyId: 'target', zone: 'internal', topMD: collar, bottomMD: shoe }];
  const steps = (prefix: string, deviceId: string, placementId: string): PrimaryPumpStep[] => [
    { id: `${prefix}-cement`, kind: 'pump', fluidId: 'cement', rateBpm: 3,
      quantity: { source: 'placement', placementId, fraction: 1 } },
    { id: `${prefix}-launch`, kind: 'tool-event', deviceId, action: liner ? 'launch-dart' : 'launch-top' },
    { id: `${prefix}-displace`, kind: 'pump', fluidId: 'displacement', rateBpm: 3,
      quantity: { source: 'displacement', deviceId, fraction: 1 } },
  ];
  const toc = kind === 'two-stage' ? 1000 : liner ? 1100 : 300;
  p.stages = [{ id: 'stage-1', name: 'Estágio 1', deviceId: 'collar', outletMD: shoe, seatMD: collar,
    targetTocMD: toc, activePathId: 'shoe-path',
    placements: [{ id: 'cement-1', fluidId: 'cement', topMD: toc, bottomMD: shoe, retainedVolumeIds: ['track'] }],
    steps: steps('s1', 'collar', 'cement-1') }];
  if (kind === 'two-stage') {
    p.devices.push({ id: 'port', name: 'Ferramenta de estágio', kind: 'stage-tool', assemblyId: 'target',
      outletMD: 1000, seatMD: 970, launchMD: 0, initialState: 'closed' });
    p.paths.push({ id: 'port-path', name: 'Circulação pela porta', legs: [
      { id: 'port-in', zone: 'internal', assemblyId: 'target', topMD: 0, bottomMD: 1000, direction: 'down' },
      { id: 'port-out', zone: 'casing-annulus', assemblyId: 'target', topMD: 0, bottomMD: 1000, direction: 'up' },
    ] });
    p.stages.push({ id: 'stage-2', name: 'Estágio 2', deviceId: 'port', outletMD: 1000, seatMD: 970,
      targetTocMD: 0, activePathId: 'port-path',
      placements: [{ id: 'cement-2', fluidId: 'cement', topMD: 0, bottomMD: 1000, retainedVolumeIds: [] }],
      steps: [{ id: 's2-open', kind: 'tool-event', deviceId: 'port', action: 'open-stage' },
        ...steps('s2', 'port', 'cement-2')] });
  }
  s.presentation.references = [{ id: 'shoe', name: 'Sapata', md: shoe, zone: 'casing-annulus', assemblyId: 'target' }];
  return s;
}
