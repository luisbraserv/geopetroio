import type { PrimaryConfiguration, PrimaryDeviceConnectionState, PrimaryPathZone } from '../models/primary-cementing.model';
import type { PrimaryCircuitCell, PrimaryConnectivityResolution, PrimaryStageGeometryResolution } from '../models/primary-geometry.model';
import type { WellGeometryIssue } from '../models/well-geometry.model';

/** Estado inicial do modelo ideal. Nenhuma transição de ferramenta é inferida. */
export function primaryInitialDeviceStates(primary: PrimaryConfiguration): PrimaryDeviceConnectionState[] {
  return primary.devices.map(d => ({ deviceId: d.id,
    internalPassage: d.kind === 'stage-tool' || d.kind === 'open-end' ? 'open' : d.initialState,
    outlet: d.kind === 'float-collar' || d.kind === 'open-end' ? 'open' : d.kind === 'stage-tool' ? d.initialState : 'closed',
  }));
}

/** Grafo de comunicação de pressão; não calcula Q, pressão, cura ou movimento de plugues. */
export function resolvePrimaryConnectivity(primary: PrimaryConfiguration, geometry: PrimaryStageGeometryResolution,
  states: PrimaryDeviceConnectionState[], activeStageId: string | null): PrimaryConnectivityResolution {
  const issues: WellGeometryIssue[] = [...geometry.issues];
  const error = (code: string, message: string): void => { issues.push({ code, message, level: 'error' }); };
  const invalid = (): PrimaryConnectivityResolution => ({ nodes: [], cells: [], connections: [], flowCellIds: [], circulation: 'invalid', issues });
  if (!geometry.inventoryCapacities || issues.some(i => i.level === 'error') || !primary.target) return invalid();
  const target = primary.target;
  // A saída do circuito principal: colar no revestimento, extremidade aberta na coluna de trabalho.
  const outletKind = target.kind === 'work-string' ? 'open-end' : 'float-collar';
  if (primary.devices.filter(d => d.kind === outletKind).length !== 1
    || primary.devices.some(d => d.kind === (outletKind === 'open-end' ? 'float-collar' : 'open-end')))
    error('PRIMARY_FLOAT_CONNECTION', outletKind === 'open-end'
      ? 'A coluna de trabalho exige exatamente uma extremidade aberta e nenhum colar.'
      : 'O circuito exige exatamente um colar flutuante.');
  const selected = activeStageId === null ? null : primary.stages.find(s => s.id === activeStageId);
  if (activeStageId !== null && !selected) error('PRIMARY_ACTIVE_STAGE', 'Estágio ativo inexistente.');
  const stateById = new Map<string, PrimaryDeviceConnectionState>();
  for (const state of states) {
    if (stateById.has(state.deviceId) || !primary.devices.some(d => d.id === state.deviceId) ||
      !['open', 'closed'].includes(state.internalPassage) || !['open', 'closed'].includes(state.outlet))
      error('PRIMARY_DEVICE_STATE', 'Estado de dispositivo inválido, desconhecido ou duplicado.');
    stateById.set(state.deviceId, state);
  }
  const deviceIds = new Set<string>();
  for (const d of primary.devices) {
    const state = stateById.get(d.id);
    if (!state || deviceIds.has(d.id)) error('PRIMARY_DEVICE_STATE', `${d.name}: informe exatamente um estado hidráulico.`);
    deviceIds.add(d.id);
    if (d.kind === 'float-collar' && (d.seatMD !== target.floatCollarMD || d.outletMD !== target.shoeMD || state?.outlet !== 'open'))
      error('PRIMARY_FLOAT_CONNECTION', 'O colar fecha a passagem interna; o shoe track continua conectado à sapata.');
    if (d.kind === 'open-end' && (d.seatMD !== target.shoeMD || d.outletMD !== target.shoeMD
      || state?.outlet !== 'open' || state.internalPassage !== 'open'))
      error('PRIMARY_FLOAT_CONNECTION', 'A extremidade aberta fica na ponta da coluna e não fecha.');
    if (d.kind === 'liner-hanger' && (target.kind !== 'liner' || d.seatMD !== target.linerTopMD || state?.outlet !== 'closed'))
      error('PRIMARY_HANGER_CONNECTION', 'O hanger representa a conexão interna no topo do liner, sem porta anular adicional.');
  }
  if (issues.some(i => i.level === 'error')) return invalid();

  const cells: PrimaryCircuitCell[] = [];
  const nodes: PrimaryConnectivityResolution['nodes'] = [];
  const connections: PrimaryConnectivityResolution['connections'] = [];
  const ends = new Map<string, { from: string; to: string }>();
  const chains = new Map<PrimaryPathZone, PrimaryCircuitCell[]>();
  const entryByDepth = new Map<PrimaryPathZone, Map<number, string>>();
  const closedSeats = new Set(primary.devices.filter(d => stateById.get(d.id)!.internalPassage === 'closed').map(d => d.seatMD));
  for (const zone of ['internal', 'casing-annulus'] as const) {
    const chain: PrimaryCircuitCell[] = [];
    const entries = new Map<number, string>();
    for (const s of geometry.fullGeometry.segments) {
      const extras = geometry.accessories.filter(a => a.zone === zone && a.ownerSegmentId === s.id);
      const accessory = (a: typeof extras[number]): PrimaryCircuitCell => ({
        id: JSON.stringify(['accessory', a.id]), kind: 'accessory', accessoryId: a.id,
        segmentId: s.id, assemblyId: a.assemblyId, zone, topMD: a.md, bottomMD: a.md, volumeBbl: a.volumeBbl,
      });
      const group: PrimaryCircuitCell[] = [
        ...extras.filter(a => a.md === s.topMD).map(accessory),
        { id: JSON.stringify(['tubular', zone, s.id]), kind: 'tubular', segmentId: s.id,
          assemblyId: s.equipmentId, zone, topMD: s.topMD, bottomMD: s.bottomMD,
          volumeBbl: (s.bottomMD - s.topMD) * (zone === 'internal' ? s.pipeCapacityBblM : s.annularCapacityBblM) },
        ...extras.filter(a => a.md === s.bottomMD).map(accessory),
      ];
      for (const cell of group) {
        const from = `${cell.id}:top`; const to = `${cell.id}:bottom`;
        nodes.push({ id: from, md: cell.topMD, zone }, { id: to, md: cell.bottomMD, zone });
        ends.set(cell.id, { from, to });
        connections.push({ from, to, kind: 'cell', cellId: cell.id });
        const previous = chain.at(-1);
        // Não cortar dentro de um grupo: o acessório já pertence a um lado do assento.
        if (previous && (previous.segmentId === cell.segmentId || zone !== 'internal' || !closedSeats.has(cell.topMD)))
          connections.push({ from: ends.get(previous.id)!.to, to: from, kind: 'continuity' });
        chain.push(cell); cells.push(cell);
      }
      entries.set(s.topMD, ends.get(group[0].id)!.from); // Lado profundo da fronteira.
    }
    entries.set(target.shoeMD, ends.get(chain.at(-1)!.id)!.to);
    chains.set(zone, chain); entryByDepth.set(zone, entries);
  }
  const head = ends.get(chains.get('internal')![0].id)!.from;
  const surfaceReturn = ends.get(chains.get('casing-annulus')![0].id)!.from;
  const outletEdges: { deviceId: string; from: string; to: string }[] = [];
  const collar = primary.devices.find(d => d.kind === outletKind)!;
  const shoeEdge = { from: entryByDepth.get('internal')!.get(target.shoeMD)!,
    to: entryByDepth.get('casing-annulus')!.get(target.shoeMD)!, deviceId: collar.id };
  connections.push({ ...shoeEdge, kind: 'shoe' }); outletEdges.push(shoeEdge);
  for (const d of primary.devices) {
    if (d.kind !== 'stage-tool' || stateById.get(d.id)!.outlet !== 'open') continue;
    const from = entryByDepth.get('internal')!.get(d.outletMD);
    const to = entryByDepth.get('casing-annulus')!.get(d.outletMD);
    if (!from || !to) { error('PRIMARY_OUTLET_NODE', `${d.name}: saída sem nó geométrico.`); continue; }
    const edge = { from, to, deviceId: d.id };
    connections.push({ ...edge, kind: 'stage-outlet' }); outletEdges.push(edge);
  }
  if (issues.some(i => i.level === 'error')) return invalid();

  type Edge = typeof connections[number];
  const adjacency = (edges: Edge[]) => {
    const map = new Map<string, { to: string; edge: Edge }[]>();
    for (const e of edges) for (const [from, to] of [[e.from, e.to], [e.to, e.from]]) {
      const neighbors = map.get(from) ?? []; neighbors.push({ to, edge: e }); map.set(from, neighbors);
    }
    return map;
  };
  const walk = (start: string, graph: ReturnType<typeof adjacency>) => {
    const visited = new Map<string, { previous: string; edge: Edge } | null>([[start, null]]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) for (const neighbor of graph.get(queue[i]) ?? []) {
      if (visited.has(neighbor.to)) continue;
      visited.set(neighbor.to, { previous: queue[i], edge: neighbor.edge }); queue.push(neighbor.to);
    }
    return visited;
  };
  const axial = adjacency(connections.filter(e => e.kind === 'cell' || e.kind === 'continuity'));
  const headReach = walk(head, axial);
  const accessibleOutlets = outletEdges.filter(e => headReach.has(e.from));
  if (accessibleOutlets.length > 1) error('PRIMARY_MULTIPLE_OUTLETS', 'Mais de uma saída comunica com a cabeça; o modelo exige um circuito ativo por vez.');
  if (selected && accessibleOutlets.length === 1 && accessibleOutlets[0].deviceId !== selected.deviceId)
    error('PRIMARY_ACTIVE_OUTLET_MISMATCH', 'A saída comunicante não corresponde ao estágio selecionado.');
  if (issues.some(i => i.level === 'error')) return invalid();

  const graph = adjacency(connections);
  const flowCellIds: string[] = [];
  if (selected && accessibleOutlets.length === 1) {
    const route = walk(head, graph);
    let cursor = surfaceReturn;
    while (cursor !== head) {
      const entry = route.get(cursor);
      if (!entry) { error('PRIMARY_RETURN_DISCONNECTED', 'O circuito não alcança o retorno.'); break; }
      if (entry.edge.cellId) flowCellIds.push(entry.edge.cellId);
      cursor = entry.previous;
    }
    flowCellIds.reverse();
  }
  if (issues.some(i => i.level === 'error')) return invalid();
  const components = new Map<string, { id: string; boundaries: ('head' | 'return')[] }>();
  for (const node of nodes) {
    if (components.has(node.id)) continue;
    const group = walk(node.id, graph);
    const boundaries: ('head' | 'return')[] = [];
    if (group.has(head)) boundaries.push('head');
    if (group.has(surfaceReturn)) boundaries.push('return');
    const component = { id: node.id, boundaries };
    for (const member of group.keys()) components.set(member, component);
  }
  const flowing = new Set(flowCellIds);
  return { nodes, connections, flowCellIds, issues,
    circulation: selected ? (flowCellIds.length ? 'open' : 'blocked') : 'idle',
    cells: cells.map(cell => {
      const component = components.get(ends.get(cell.id)!.from)!;
      return { ...cell, componentId: component.id, pressureBoundaries: [...component.boundaries],
        connectivity: flowing.has(cell.id) ? 'circulating' : component.boundaries.length ? 'static-connected' : 'isolated' };
    }),
  };
}
