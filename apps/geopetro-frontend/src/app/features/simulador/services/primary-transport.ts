import type { PrimaryConfiguration, PrimaryDeviceConnectionState, PrimaryDiagnostic, PrimaryEvent,
  PrimaryFluidInventory, PrimaryPathZone, PrimarySnapshot } from '../models/primary-cementing.model';
import type { PrimaryCircuitCell, PrimaryConnectivityResolution, PrimaryGeometrySegment,
  PrimaryResolvedAccessory, PrimaryStageGeometryResolution } from '../models/primary-geometry.model';
import type { PrimaryParcel, PrimaryPlacementOutcome, PrimaryRateDecision,
  PrimaryRateModel, PrimaryTransportOptions, PrimaryTransportResult,
  PrimaryTransportSnapshot } from '../models/primary-transport.model';
import type { PrimaryProgramVolumes, PrimaryStepVolume } from '../models/primary-volumes.model';
import { primaryInitialDeviceStates, resolvePrimaryConnectivity } from './primary-connectivity';

/** Tolerâncias de software da SPEC §11.3; não são precisão de engenharia. */
const VOLUME_EPS = 1e-9;
const balanceTolerance = (moved: number): number => Math.max(1e-8, 1e-8 * Math.abs(moved));
/** Vazio no topo do interno: não é fluido, não entra em inventário nem em parcelas. */
const VOID = '__void__';
/** Passo de tempo máximo em pausa ou drenagem lenta, em minutos. */
const MAX_DT_MIN = 1;
const MAX_ITERATIONS = 200_000;
/** Pausa até o equilíbrio: abaixo desta vazão de drenagem o tubo em U parou. */
const SETTLE_RATE_BPM = 1e-3;
/** Volume máximo drenado por passo no equilíbrio, para o nível não passar do ponto. */
const SETTLE_STEP_BBL = 0.02;

/**
 * Profundidade alcançada descendo pelo interior a partir de `fromMD` com um
 * volume conhecido. Cavidades em série consomem volume sem deslocar o corpo.
 */
export function primaryInternalAdvance(segments: PrimaryGeometrySegment[], accessories: PrimaryResolvedAccessory[],
  fromMD: number, volumeBbl: number): number | null {
  if (![fromMD, volumeBbl].every(Number.isFinite) || volumeBbl < 0) return null;
  const ordered = segments.filter(s => s.bottomMD > fromMD).sort((a, b) => a.topMD - b.topMD);
  if (!ordered.length) return null;
  const cavity = (segmentId: string, md: number) => accessories
    .filter(a => a.zone === 'internal' && a.ownerSegmentId === segmentId && a.md === md)
    .reduce((sum, a) => sum + a.volumeBbl, 0);
  let remaining = volumeBbl;
  let md = fromMD;
  for (const segment of ordered) {
    const top = Math.max(segment.topMD, fromMD);
    for (const boundary of ['top', 'length', 'bottom'] as const) {
      if (boundary === 'length') {
        const capacity = segment.pipeCapacityBblM;
        if (!Number.isFinite(capacity) || capacity <= 0) return null;
        const full = (segment.bottomMD - top) * capacity;
        if (remaining <= full + VOLUME_EPS) return top + remaining / capacity;
        remaining -= full;
        md = segment.bottomMD;
        continue;
      }
      const extra = cavity(segment.id, boundary === 'top' ? segment.topMD : segment.bottomMD);
      if (extra <= 0) continue;
      if (remaining <= extra + VOLUME_EPS) return boundary === 'top' ? top : segment.bottomMD;
      remaining -= extra;
    }
  }
  return md;
}

interface PlugState {
  id: string; deviceId: string; stageId: string;
  kind: 'bottom' | 'top' | 'dart' | 'liner-wiper';
  state: PrimarySnapshot['plugs'][number]['state'];
  launchMD: number; seatMD: number;
  /**
   * Coordenada de volume do corpo desde o ponto de lançamento. Com circuito cheio
   * é o volume bombeado após o lançamento; em queda livre o corpo anda com o
   * líquido, e o vazio acima dele também conta.
   */
  travelledBbl: number; targetBbl: number;
  /** Fecha o assento ao chegar; o inferior e o dardo abrem passagem. */
  sealsOnLanding: boolean;
}

/** Conteúdo em ordem de fluxo: índice 0 é a parcela mais próxima da saída da célula. */
type CellContents = Map<string, PrimaryParcel[]>;

const totalOf = (parcels: PrimaryParcel[]): number => parcels.reduce((sum, p) => sum + p.volumeBbl, 0);

function appendParcels(target: PrimaryParcel[], incoming: PrimaryParcel[]): void {
  for (const parcel of incoming) {
    if (parcel.volumeBbl <= 0) continue;
    const last = target.at(-1);
    if (last && last.fluidId === parcel.fluidId) last.volumeBbl += parcel.volumeBbl;
    else target.push({ ...parcel });
  }
}

/** Remove pela saída da célula, devolvendo o que saiu em ordem de fluxo. */
function takeFromExit(contents: PrimaryParcel[], volumeBbl: number): PrimaryParcel[] {
  const removed: PrimaryParcel[] = [];
  let remaining = volumeBbl;
  while (remaining > VOLUME_EPS && contents.length) {
    const head = contents[0];
    const take = Math.min(head.volumeBbl, remaining);
    appendParcels(removed, [{ fluidId: head.fluidId, volumeBbl: take }]);
    head.volumeBbl -= take;
    remaining -= take;
    if (head.volumeBbl <= VOLUME_EPS) contents.shift();
  }
  return removed;
}

/** Empurra pelo circuito célula a célula; o que sai da última é retorno. */
function pushThroughRoute(contents: CellContents, route: string[], incoming: PrimaryParcel[]): PrimaryParcel[] {
  let moving = incoming;
  for (const cellId of route) {
    const cell = contents.get(cellId);
    if (!cell) continue;
    // Entra pela entrada e sai pela saída: com avanço maior que a célula, o
    // excedente atravessa em vez de estourar a capacidade dela.
    const volume = totalOf(moving);
    appendParcels(cell, moving);
    moving = takeFromExit(cell, volume);
  }
  return moving;
}

/**
 * Interfaces do circuito com o volume acumulado desde a cabeça. O fluido da
 * interface é o de montante: é ele que chega à saída e empurra o de jusante.
 * O topo do líquido sob o vazio não é interface entre fluidos.
 */
function routeBoundaries(contents: CellContents, route: string[]): { cumulative: number; fluidId: string }[] {
  const boundaries: { cumulative: number; fluidId: string }[] = [];
  let cumulative = 0;
  let previous: string | null = null;
  for (const cellId of route) {
    // Da cabeça para o retorno: dentro da célula, o último índice é o mais próximo da entrada.
    for (const parcel of [...(contents.get(cellId) ?? [])].reverse()) {
      if (parcel.fluidId === VOID) { cumulative += parcel.volumeBbl; continue; }
      if (previous !== null && parcel.fluidId !== previous) boundaries.push({ cumulative, fluidId: previous });
      previous = parcel.fluidId;
      cumulative += parcel.volumeBbl;
    }
  }
  return boundaries;
}

export function simulatePrimaryTransport(primary: PrimaryConfiguration,
  geometry: PrimaryStageGeometryResolution, program: PrimaryProgramVolumes,
  options: PrimaryTransportOptions = {}): PrimaryTransportResult {
  const diagnostics: PrimaryDiagnostic[] = [];
  const events: PrimaryEvent[] = [];
  const snapshots: PrimaryTransportSnapshot[] = [];
  const note = (code: string, message: string, extra: Partial<PrimaryDiagnostic> = {}): void => {
    diagnostics.push({ code, message, severity: 'error', category: 'placement', ...extra });
  };
  const invalid = (code: string, message: string): PrimaryTransportResult => {
    note(code, message, { category: 'configuration' });
    return { snapshots, events, placements: [], inventory: [], diagnostics, totalTimeMin: 0,
      totalPumpedBbl: 0, status: 'invalid', halted: false };
  };
  if (!program.stages.length || !primary.target || !primary.initialFluidId)
    return invalid('PRIMARY_TRANSPORT_INPUT', 'O transporte exige alvo, fluido inicial e programa dimensionados.');
  const initialFluidId = primary.initialFluidId;
  const states: PrimaryDeviceConnectionState[] = primaryInitialDeviceStates(primary);
  const connect = (activeStageId: string | null): PrimaryConnectivityResolution =>
    resolvePrimaryConnectivity(primary, geometry, states, activeStageId);
  const first = connect(program.stages[0].stageId);
  if (first.circulation === 'invalid')
    return invalid('PRIMARY_TRANSPORT_CIRCUIT', 'O circuito inicial não é válido para transporte.');

  const cells = new Map<string, PrimaryCircuitCell>(first.cells.map(cell => [cell.id, cell]));
  const contents: CellContents = new Map(first.cells.map(cell =>
    [cell.id, cell.volumeBbl > 0 ? [{ fluidId: initialFluidId, volumeBbl: cell.volumeBbl }] : []]));
  const initialByFluid = new Map<string, number>([[initialFluidId,
    first.cells.reduce((sum, cell) => sum + cell.volumeBbl, 0)]]);
  const pumpedByFluid = new Map<string, number>();
  const returnedByFluid = new Map<string, number>();
  const plugs: PlugState[] = [];
  let timeMin = 0;
  let totalPumpedBbl = 0;
  let activeStageId = program.stages[0].stageId;
  let connectivity = first;
  let liveCells = new Map(first.cells.map(cell => [cell.id, cell]));
  let halted = false;
  const rateModel: PrimaryRateModel | undefined = options.rateModel;
  const routeVolume = first.cells.reduce((sum, cell) => sum + cell.volumeBbl, 0);
  // Passo de volume: fino o bastante para o pico e a entrada em queda livre, sem
  // amostrar mais que o necessário para os gráficos.
  const maxAdvanceBbl = options.maxAdvanceBbl ?? Math.max(0.05, Math.min(1, routeVolume / 400));

  /** Uma passada pelo poço: volume de cada fluido por zona, sem o vazio. */
  const inventory = (): PrimaryFluidInventory[] => {
    const zones = new Map<string, { internal: number; annular: number }>();
    for (const id of [...initialByFluid.keys(), ...pumpedByFluid.keys(), ...returnedByFluid.keys()])
      if (!zones.has(id)) zones.set(id, { internal: 0, annular: 0 });
    for (const [cellId, parcels] of contents) {
      const zone: PrimaryPathZone | undefined = cells.get(cellId)?.zone;
      for (const parcel of parcels) {
        if (parcel.fluidId === VOID) continue;
        let entry = zones.get(parcel.fluidId);
        if (!entry) { entry = { internal: 0, annular: 0 }; zones.set(parcel.fluidId, entry); }
        if (zone === 'internal') entry.internal += parcel.volumeBbl;
        else if (zone === 'casing-annulus') entry.annular += parcel.volumeBbl;
      }
    }
    return [...zones.entries()].map(([fluidId, volume]) => {
      const initial = initialByFluid.get(fluidId) ?? 0;
      const pumped = pumpedByFluid.get(fluidId) ?? 0;
      const returnedBbl = returnedByFluid.get(fluidId) ?? 0;
      return { fluidId, initialBbl: initial, pumpedBbl: pumped, internalBbl: volume.internal,
        annularBbl: volume.annular, returnedBbl,
        balanceErrorBbl: initial + pumped - (volume.internal + volume.annular + returnedBbl) };
    });
  };
  const voidTotal = (): number => [...contents.values()].reduce((sum, parcels) =>
    sum + parcels.filter(p => p.fluidId === VOID).reduce((s, p) => s + p.volumeBbl, 0), 0);

  /** Parcelas com MD: dentro da célula o volume é proporcional ao comprimento. O vazio só ocupa espaço. */
  const layout = (): { parcels: PrimarySnapshot['parcels']; voids: { topMD: number; bottomMD: number; volumeBbl: number }[] } => {
    const placed: PrimarySnapshot['parcels'] = [];
    const voids: { topMD: number; bottomMD: number; volumeBbl: number }[] = [];
    for (const [cellId, parcels] of contents) {
      const cell = cells.get(cellId);
      if (!cell || !parcels.length) continue;
      const live = liveCells.get(cellId);
      const length = cell.bottomMD - cell.topMD;
      const capacity = cell.volumeBbl > 0 ? length / cell.volumeBbl : 0;
      // Ordem de profundidade: no interior o fluxo desce, então a saída é o fundo.
      const byDepth = cell.zone === 'internal' ? [...parcels].reverse() : parcels;
      let cursor = cell.topMD;
      for (const parcel of byDepth) {
        const bottomMD = length > 0 ? cursor + parcel.volumeBbl * capacity : cell.bottomMD;
        if (parcel.fluidId === VOID) voids.push({ topMD: cursor, bottomMD, volumeBbl: parcel.volumeBbl });
        else placed.push({ fluidId: parcel.fluidId, assemblyId: cell.assemblyId, zone: cell.zone,
          topMD: cursor, bottomMD, volumeBbl: parcel.volumeBbl,
          connectivity: live?.connectivity ?? 'isolated' });
        cursor = length > 0 ? bottomMD : cursor;
      }
    }
    return { parcels: placed, voids };
  };
  const plugMD = (plug: PlugState): number | null => plug.state === 'not-launched' ? null
    : plug.state === 'travelling'
      ? primaryInternalAdvance(geometry.fullGeometry.segments, geometry.accessories, plug.launchMD, plug.travelledBbl)
      : plug.seatMD;
  let currentStepId: string | null = null;
  let currentRateBpm = 0;
  const activeOutletMD = (): number | null => {
    const firstAnnular = connectivity.flowCellIds.find(id => cells.get(id)?.zone === 'casing-annulus');
    return firstAnnular ? cells.get(firstAnnular)!.bottomMD : null;
  };
  const sealedInStage = (): boolean => plugs.some(p => p.stageId === activeStageId && p.state === 'landed-closed');

  /** Decisão de vazão no estado atual; sem modelo, o circuito é sempre cheio (P5). */
  type Layout = ReturnType<typeof layout>;
  const decide = (pumpRateBpm: number, placed?: Layout): PrimaryRateDecision => {
    const sealed = sealedInStage() || !connectivity.flowCellIds.length;
    if (!rateModel) return sealed ? { regime: 'landed', outletRateBpm: 0 }
      : { regime: pumpRateBpm > 0 ? 'full' : 'static', outletRateBpm: pumpRateBpm };
    const { parcels } = placed ?? layout();
    return rateModel({ parcels, voidBbl: voidTotal(), pumpRateBpm, sealed,
      outletMD: activeOutletMD() ?? primary.target!.shoeMD, stageId: activeStageId });
  };

  const snapshot = (reason: PrimaryTransportSnapshot['reason'], decision?: PrimaryRateDecision,
    placed?: Layout, fluids?: PrimaryFluidInventory[]): void => {
    const current = placed ?? layout();
    const state = decision ?? decide(currentRateBpm, current);
    const { parcels, voids } = current;
    snapshots.push({ timeMin, stageId: activeStageId,
      activePathId: primary.stages.find(s => s.id === activeStageId)?.activePathId ?? '',
      parcels, voids, devices: states.map(s => ({ ...s })),
      plugs: plugs.map(p => ({ id: p.id, deviceId: p.deviceId, kind: p.kind, md: plugMD(p), state: p.state })),
      inventory: fluids ?? inventory(), reason, stepId: currentStepId, pumpRateBpm: currentRateBpm,
      activeOutletMD: activeOutletMD(), pumpedBbl: totalPumpedBbl,
      // Sem modelo de vazão o regime não é decidido aqui: a hidráulica o julga pelo balanço.
      ...(rateModel ? { voidBbl: voidTotal(),
        outletRateBpm: 'outletRateBpm' in state ? state.outletRateBpm : null,
        flowRegime: state.regime,
        ...('reason' in state && state.regime === 'outside-model' ? { outsideModelCode: state.reason } : {}) } : {}) });
  };
  const emit = (kind: PrimaryEvent['kind'], md: number, stepId: string | null,
    extra: Partial<PrimaryEvent> = {}): void => {
    events.push({ timeMin, stageId: activeStageId, stepId, kind, md, ...extra });
    snapshot('event');
  };
  const refreshCircuit = (): void => {
    connectivity = connect(activeStageId);
    liveCells = new Map(connectivity.cells.map(cell => [cell.id, cell]));
    if (connectivity.circulation === 'invalid')
      note('PRIMARY_TRANSPORT_CIRCUIT', 'O circuito deixou de ser válido após um evento de ferramenta.',
        { stageId: activeStageId, category: 'configuration', timeMin });
  };
  /** Primeiro estado fora do modelo encerra o transporte: nada depois disso é resultado. */
  const haltOutsideModel = (decision: Extract<PrimaryRateDecision, { regime: 'outside-model' }>, stepId: string | null): void => {
    halted = true;
    events.push({ timeMin, stageId: activeStageId, stepId, kind: 'outside-model',
      md: activeOutletMD() ?? primary.target!.shoeMD });
    snapshot('event', decision);
    diagnostics.push({ code: decision.reason, severity: 'warning', category: 'outside-model',
      stageId: activeStageId, stepId: stepId ?? undefined, timeMin,
      message: `${decision.message} O transporte para aqui; o que vem depois não é resultado calculado.` });
  };

  // Queda livre: períodos registrados como diagnóstico informativo, sem inventar perda.
  let freeFallStart: number | null = null;
  let freeFallPeakRate = 0;
  let freeFallPeakVoid = 0;
  const trackFreeFall = (decision: PrimaryRateDecision): void => {
    if (decision.regime === 'free-fall') {
      freeFallStart ??= timeMin;
      if ('outletRateBpm' in decision) freeFallPeakRate = Math.max(freeFallPeakRate, decision.outletRateBpm);
      freeFallPeakVoid = Math.max(freeFallPeakVoid, voidTotal());
    } else if (freeFallStart !== null) closeFreeFall();
  };
  const closeFreeFall = (): void => {
    if (freeFallStart === null) return;
    diagnostics.push({ code: 'PRIMARY_FREE_FALL', severity: 'info', category: 'placement',
      stageId: activeStageId, timeMin: freeFallStart, endTimeMin: timeMin, value: freeFallPeakRate, limit: freeFallPeakVoid,
      message: `Queda livre entre ${freeFallStart.toFixed(2)} e ${timeMin.toFixed(2)} min: a coluna interna desce mais rápido que o bombeio, com vazão de saída de até ${freeFallPeakRate.toFixed(2)} bpm e vazio de até ${freeFallPeakVoid.toFixed(2)} bbl no topo do interno. Retorno acima do bombeado nesse período não é ganho nem perda de fluido.` });
    freeFallStart = null; freeFallPeakRate = 0; freeFallPeakVoid = 0;
  };

  snapshot('start');
  for (const stageVolumes of program.stages) {
    if (halted) break;
    const stage = primary.stages.find(s => s.id === stageVolumes.stageId);
    const stageGeometry = geometry.stages.find(s => s.stageId === stageVolumes.stageId);
    if (!stage || !stageGeometry) continue;
    if (stageVolumes.stageId !== activeStageId) {
      activeStageId = stageVolumes.stageId;
      refreshCircuit();
    }
    for (const step of stageVolumes.steps) {
      if (halted) break;
      const declared = stage.steps.find(s => s.id === step.stepId);
      if (!declared) continue;
      if (declared.kind === 'tool-event') {
        currentStepId = step.stepId;
        currentRateBpm = 0;
        applyToolEvent(declared.deviceId, declared.action, step.stepId);
        continue;
      }
      if (declared.kind === 'pause') {
        currentStepId = step.stepId;
        currentRateBpm = 0;
        runInterval(step, null, 0, step.durationMin, stageGeometry.displacementBbl, declared.untilBalanced === true);
        continue;
      }
      pumpStep(step, stageGeometry.displacementBbl);
      currentRateBpm = 0;
    }
    if (!halted) closeStage(stage.id);
  }
  closeFreeFall();
  if (!halted) {
    currentStepId = null;
    currentRateBpm = 0;
    snapshot('end');
  }

  function applyToolEvent(deviceId: string, action: 'launch-bottom' | 'launch-top' | 'launch-dart'
    | 'open-stage' | 'close-stage', stepId: string): void {
    const device = primary.devices.find(d => d.id === deviceId);
    const state = states.find(s => s.deviceId === deviceId);
    if (!device || !state) {
      note('PRIMARY_TOOL_DEVICE', `${stepId}: dispositivo inexistente para o evento de ferramenta.`,
        { stageId: activeStageId, stepId, category: 'configuration', timeMin });
      return;
    }
    if (action === 'open-stage' || action === 'close-stage') {
      const open = action === 'open-stage';
      if (device.kind !== 'stage-tool' || state.outlet === (open ? 'open' : 'closed')) {
        note('PRIMARY_TOOL_SEQUENCE', `${stepId}: ${device.name} não pode ${open ? 'abrir' : 'fechar'} neste estado.`,
          { stageId: activeStageId, stepId, category: 'configuration', timeMin });
        return;
      }
      state.outlet = open ? 'open' : 'closed';
      refreshCircuit();
      emit(open ? 'stage-opened' : 'stage-closed', device.outletMD, stepId, { deviceId });
      return;
    }
    const kind = action === 'launch-bottom' ? 'bottom' : action === 'launch-dart' ? 'dart' : 'top';
    if (plugs.some(p => p.deviceId === deviceId && p.kind === kind)) {
      note('PRIMARY_TOOL_SEQUENCE', `${stepId}: o corpo já foi lançado neste dispositivo.`,
        { stageId: activeStageId, stepId, category: 'configuration', timeMin });
      return;
    }
    if (kind === 'dart' && primary.target?.kind !== 'liner') {
      note('PRIMARY_TOOL_SEQUENCE', `${stepId}: dardo só existe em liner.`,
        { stageId: activeStageId, stepId, category: 'configuration', timeMin });
      return;
    }
    const declaresBottom = primary.stages.find(s => s.id === activeStageId)?.steps
      .some(s => s.kind === 'tool-event' && s.deviceId === deviceId && s.action === 'launch-bottom');
    if (kind === 'top' && declaresBottom && !plugs.some(p => p.deviceId === deviceId && p.kind === 'bottom')) {
      note('PRIMARY_TOOL_SEQUENCE', `${stepId}: o plugue inferior precisa ser lançado antes do superior.`,
        { stageId: activeStageId, stepId, category: 'configuration', timeMin });
      return;
    }
    const stageGeometry = geometry.stages.find(s => s.stageId === activeStageId);
    if (!stageGeometry) return;
    const target = kind === 'dart' ? stageGeometry.dartTravelBbl ?? 0 : stageGeometry.displacementBbl;
    // Lançado na cabeça com vazio no topo, o corpo cai até o líquido: começa abaixo do vazio.
    const launchedOnVoid = device.launchMD <= 0 ? voidTotal() : 0;
    plugs.push({ id: `${deviceId}-${kind}`, deviceId, stageId: activeStageId, kind, state: 'travelling',
      launchMD: device.launchMD, travelledBbl: launchedOnVoid, targetBbl: target,
      seatMD: kind === 'dart' ? primary.target!.kind === 'liner' ? primary.target!.linerTopMD : device.seatMD : device.seatMD,
      sealsOnLanding: kind === 'top' });
    emit(kind === 'bottom' ? 'bottom-plug-launched' : kind === 'dart' ? 'dart-launched' : 'top-plug-launched',
      device.launchMD, stepId, { deviceId });
  }

  function landPlug(plug: PlugState, stepId: string | null): void {
    if (plug.kind === 'dart') {
      plug.state = 'landed-open';
      const stageGeometry = geometry.stages.find(s => s.stageId === plug.stageId);
      emit('liner-wiper-released', plug.seatMD, stepId, { deviceId: plug.deviceId });
      plugs.push({ id: `${plug.deviceId}-liner-wiper`, deviceId: plug.deviceId, stageId: plug.stageId,
        kind: 'liner-wiper', state: 'travelling', launchMD: plug.seatMD,
        seatMD: primary.devices.find(d => d.id === plug.deviceId)!.seatMD,
        travelledBbl: 0, targetBbl: stageGeometry?.wiperTravelBbl ?? 0, sealsOnLanding: true });
      return;
    }
    plug.state = plug.sealsOnLanding ? 'landed-closed' : 'landed-open';
    if (plug.kind === 'bottom') {
      emit('bottom-plug-opened', plug.seatMD, stepId, { deviceId: plug.deviceId });
      return;
    }
    // Assentamento fecha a passagem interna; o track segue conectado à sapata.
    const state = states.find(s => s.deviceId === plug.deviceId);
    if (state) state.internalPassage = 'closed';
    refreshCircuit();
    emit('top-plug-landed', plug.seatMD, stepId, { deviceId: plug.deviceId });
  }

  /** Cells internas da rota, da cabeça para baixo: onde o vazio pode existir. */
  function internalRouteCells(route: string[]): string[] {
    const ids = route.filter(id => cells.get(id)?.zone === 'internal');
    if (ids.length) return ids;
    // Rota fechada após o assentamento: o vazio ainda está nas células acima do plugue.
    return [...contents.keys()].filter(id => cells.get(id)?.zone === 'internal'
      && contents.get(id)!.some(p => p.fluidId === VOID)).sort((a, b) => cells.get(a)!.topMD - cells.get(b)!.topMD);
  }

  /** O líquido cai pelo vazio: todo o vazio sobe para o topo do interno, sem mudar a ordem do líquido. */
  function restackVoid(route: string[]): void {
    const ids = internalRouteCells(route);
    let voidVolume = 0;
    const liquid: PrimaryParcel[] = [];
    for (const id of ids) for (const parcel of [...contents.get(id)!].reverse()) {
      if (parcel.fluidId === VOID) voidVolume += parcel.volumeBbl;
      else appendParcels(liquid, [parcel]);
    }
    if (voidVolume <= VOLUME_EPS) {
      for (const id of ids) contents.set(id, contents.get(id)!.filter(p => p.fluidId !== VOID));
      return;
    }
    let remainingVoid = voidVolume;
    let index = 0;
    for (const id of ids) {
      let room = cells.get(id)!.volumeBbl;
      const headFirst: PrimaryParcel[] = [];
      const voidHere = Math.min(room, remainingVoid);
      if (voidHere > VOLUME_EPS) headFirst.push({ fluidId: VOID, volumeBbl: voidHere });
      remainingVoid -= voidHere;
      room -= voidHere;
      while (room > VOLUME_EPS && index < liquid.length) {
        const parcel = liquid[index];
        const take = Math.min(room, parcel.volumeBbl);
        appendParcels(headFirst, [{ fluidId: parcel.fluidId, volumeBbl: take }]);
        parcel.volumeBbl -= take;
        room -= take;
        if (parcel.volumeBbl <= VOLUME_EPS) index++;
      }
      contents.set(id, headFirst.reverse());
    }
  }

  /** Bombeio sobre o vazio: o nível do líquido sobe, o vazio encolhe por baixo. */
  function fillVoid(route: string[], fluidId: string, volumeBbl: number): void {
    const ids = internalRouteCells(route);
    let remaining = volumeBbl;
    // Do fundo do vazio para cima: a célula mais profunda que tem vazio primeiro.
    for (const id of [...ids].reverse()) {
      if (remaining <= VOLUME_EPS) break;
      const parcels = contents.get(id)!;
      const index = parcels.findIndex(p => p.fluidId === VOID);
      if (index < 0) continue;
      const take = Math.min(parcels[index].volumeBbl, remaining);
      parcels[index].volumeBbl -= take;
      remaining -= take;
      // Logo abaixo do vazio (índice anterior na ordem de fluxo), o fluido bombeado.
      const below = parcels[index - 1];
      if (below && below.fluidId === fluidId) below.volumeBbl += take;
      else parcels.splice(index, 0, { fluidId, volumeBbl: take });
      contents.set(id, parcels.filter(p => p.volumeBbl > VOLUME_EPS));
    }
  }

  /**
   * Um intervalo do programa: bombeio (`fluidId` com vazão) ou pausa (sem fluido).
   * Avança no tempo com a vazão de saída decidida pelo modelo; em circuito cheio
   * ela é a de bombeio e o resultado é o do transporte volumétrico de P5.
   */
  function runInterval(step: PrimaryStepVolume, fluidId: string | null, pumpRate: number,
    durationMin: number | null, displacementTargetBbl: number, untilBalanced = false): void {
    currentRateBpm = pumpRate;
    let remainingVolume = fluidId ? step.volumeBbl : 0;
    let remainingTime = durationMin ?? 0;
    let decision = decide(pumpRate);
    if (decision.regime === 'outside-model') { haltOutsideModel(decision, step.stepId); return; }
    trackFreeFall(decision);
    snapshot('step-start', decision);
    let guard = 0;
    const settleStart = timeMin;
    let drainedBbl = 0;
    const draining = () => 'outletRateBpm' in decision && decision.outletRateBpm > SETTLE_RATE_BPM;
    let balanced = untilBalanced && !fluidId && !draining();
    const done = () => balanced || (fluidId ? remainingVolume <= VOLUME_EPS : remainingTime <= 1e-12);
    while (!done()) {
      if (++guard > MAX_ITERATIONS) {
        note('PRIMARY_TRANSPORT_STALL', `${step.stepId}: o transporte não avançou; passo interrompido.`,
          { stageId: step.stageId, stepId: step.stepId, timeMin });
        return;
      }
      const route = connectivity.flowCellIds;
      const sealed = sealedInStage() || !route.length;
      const voidNow = voidTotal();
      const outletRate = 'outletRateBpm' in decision ? decision.outletRateBpm : 0;
      if (fluidId && sealed && voidNow <= VOLUME_EPS) {
        if (sealedInStage())
          diagnostics.push({ code: 'PRIMARY_OVERDISPLACEMENT', severity: 'warning', category: 'operational-limit',
            stageId: step.stageId, stepId: step.stepId, timeMin, value: remainingVolume, limit: displacementTargetBbl,
            message: `${step.stepId}: ${remainingVolume} bbl além do deslocamento alvo; o modelo para no assentamento e não avança fluido pelo plugue fechado.` });
        else note('PRIMARY_TRANSPORT_BLOCKED', `${step.stepId}: não há circuito aberto; ${remainingVolume} bbl não foram transportados.`,
          { stageId: step.stageId, stepId: step.stepId, timeMin, value: remainingVolume });
        return;
      }
      if (!fluidId && outletRate <= 0) {
        // Pausa sem drenagem (circuito parado, ou vazio já em equilíbrio): nada se move até o fim.
        // Até o equilíbrio, a pausa termina aqui mesmo.
        if (untilBalanced) { balanced = true; break; }
        timeMin += remainingTime;
        remainingTime = 0;
        break;
      }
      // Passo em tempo, limitado pelo primeiro evento: fim do passo, corpo no
      // assento, interface na saída ou no retorno, vazio zerando, passo de volume.
      const candidates: number[] = [];
      if (fluidId) candidates.push(remainingVolume / pumpRate); else candidates.push(remainingTime);
      const fastest = Math.max(outletRate, pumpRate);
      candidates.push(fastest > 0 ? maxAdvanceBbl / fastest : MAX_DT_MIN, MAX_DT_MIN);
      const travelling = plugs.filter(p => p.state === 'travelling');
      if (outletRate > 0 && route.length) {
        for (const plug of travelling) candidates.push((plug.targetBbl - plug.travelledBbl) / outletRate);
        const internalTotal = route.reduce((sum, id) =>
          cells.get(id)?.zone === 'internal' ? sum + (cells.get(id)?.volumeBbl ?? 0) : sum, 0);
        const routeTotal = route.reduce((sum, id) => sum + (cells.get(id)?.volumeBbl ?? 0), 0);
        const headCell = contents.get(route[0]) ?? [];
        const headFluid = headCell.at(-1)?.fluidId ?? null;
        // A própria injeção cria uma interface; sem ela o evento se perderia num passo longo.
        const boundaries = [...(fluidId && voidNow <= VOLUME_EPS && headFluid !== null && headFluid !== fluidId
          ? [{ cumulative: 0, fluidId }] : []), ...routeBoundaries(contents, route)];
        for (const boundary of boundaries) {
          candidates.push((internalTotal - boundary.cumulative) / outletRate, (routeTotal - boundary.cumulative) / outletRate);
        }
      }
      if (voidNow > VOLUME_EPS && pumpRate > outletRate) candidates.push(voidNow / (pumpRate - outletRate));
      if (untilBalanced && outletRate > 0) candidates.push(SETTLE_STEP_BBL / outletRate);
      const dt = Math.min(...candidates.filter(value => value > 1e-12));
      if (!Number.isFinite(dt)) break;
      const liquidMove = route.length && !sealedInStage() ? outletRate * dt : 0;
      const pumpIn = fluidId ? pumpRate * dt : 0;
      const before = route.length ? { internal: route.reduce((sum, id) =>
        cells.get(id)?.zone === 'internal' ? sum + (cells.get(id)?.volumeBbl ?? 0) : sum, 0),
      total: route.reduce((sum, id) => sum + (cells.get(id)?.volumeBbl ?? 0), 0),
      boundaries: routeBoundaries(contents, route), injected: fluidId && voidNow <= VOLUME_EPS
        && (contents.get(route[0]) ?? []).at(-1)?.fluidId !== fluidId } : null;
      if (liquidMove > 0) {
        const incoming: PrimaryParcel[] = liquidMove >= pumpIn
          ? [{ fluidId: fluidId ?? VOID, volumeBbl: fluidId ? pumpIn : 0 }, { fluidId: VOID, volumeBbl: liquidMove - pumpIn }]
          : [{ fluidId: fluidId!, volumeBbl: liquidMove }];
        const returned = pushThroughRoute(contents, route, incoming.filter(p => p.volumeBbl > 0));
        for (const parcel of returned)
          if (parcel.fluidId !== VOID)
            returnedByFluid.set(parcel.fluidId, (returnedByFluid.get(parcel.fluidId) ?? 0) + parcel.volumeBbl);
        restackVoid(route);
      }
      if (fluidId && pumpIn > liquidMove) fillVoid(route, fluidId, pumpIn - liquidMove);
      drainedBbl += liquidMove;
      if (fluidId) {
        pumpedByFluid.set(fluidId, (pumpedByFluid.get(fluidId) ?? 0) + pumpIn);
        totalPumpedBbl += pumpIn;
        remainingVolume -= pumpIn;
      } else remainingTime -= dt;
      for (const plug of travelling) plug.travelledBbl += liquidMove;
      timeMin += dt;
      if (before && liquidMove > 0) {
        const outletMD = cells.get(route.find(id => cells.get(id)?.zone === 'casing-annulus') ?? '')?.bottomMD
          ?? primary.target!.shoeMD;
        const boundaries = [...(before.injected && fluidId ? [{ cumulative: 0, fluidId }] : []), ...before.boundaries];
        for (const boundary of boundaries) {
          if (Math.abs(before.internal - boundary.cumulative - liquidMove) <= VOLUME_EPS)
            emit('interface-at-outlet', outletMD, step.stepId, { fluidId: boundary.fluidId });
          if (Math.abs(before.total - boundary.cumulative - liquidMove) <= VOLUME_EPS)
            emit('interface-at-return', 0, step.stepId, { fluidId: boundary.fluidId });
        }
      }
      for (const plug of travelling)
        if (plug.targetBbl - plug.travelledBbl <= VOLUME_EPS) {
          plug.travelledBbl = plug.targetBbl;
          // Estado dinâmico no instante da chegada, antes de o plugue fechar a passagem:
          // é aí que ficam a pressão final de circulação e o maior ECD do deslocamento.
          if (plug.sealsOnLanding) snapshot('pre-event');
          landPlug(plug, step.stepId);
        }
      const moved = totalPumpedBbl;
      const fluids = inventory();
      for (const entry of fluids)
        if (Math.abs(entry.balanceErrorBbl) > balanceTolerance(moved))
          note('PRIMARY_BALANCE_RESIDUAL', `${entry.fluidId}: o balanço por fluido não fechou (${entry.balanceErrorBbl} bbl).`,
            { stageId: step.stageId, stepId: step.stepId, timeMin, value: entry.balanceErrorBbl });
      const placed = layout();
      decision = decide(pumpRate, placed);
      if (decision.regime === 'outside-model') { haltOutsideModel(decision, step.stepId); return; }
      trackFreeFall(decision);
      if (untilBalanced && !fluidId && !draining()) balanced = true;
      if (!done()) snapshot('sample', decision, placed, fluids);
    }
    snapshot('step-end', decision);
    if (!untilBalanced || fluidId) return;
    const elapsed = timeMin - settleStart;
    if (balanced) {
      emit('balance-reached', activeOutletMD() ?? primary.target!.shoeMD, step.stepId);
      diagnostics.push({ code: 'PRIMARY_SETTLE', severity: 'info', category: 'placement',
        stageId: step.stageId, stepId: step.stepId, timeMin: settleStart, endTimeMin: timeMin,
        value: drainedBbl, limit: elapsed,
        message: drainedBbl > VOLUME_EPS
          ? `Equilíbrio do tubo em U depois de drenar ${drainedBbl.toFixed(3)} bbl em ${elapsed.toFixed(2)} min.`
          : 'As colunas já estavam em equilíbrio: nada drenou.' });
    } else diagnostics.push({ code: 'PRIMARY_SETTLE_TIMEOUT', severity: 'warning', category: 'placement',
      stageId: step.stageId, stepId: step.stepId, timeMin: settleStart, endTimeMin: timeMin, value: drainedBbl,
      message: `O tubo em U ainda drenava ao fim de ${elapsed.toFixed(2)} min (${drainedBbl.toFixed(3)} bbl drenados); aumente o tempo máximo da pausa.` });
  }

  function pumpStep(step: PrimaryStepVolume, displacementTargetBbl: number): void {
    if (!step.fluidId || step.volumeBbl <= 0 || !step.rateBpm) {
      if (step.volumeBbl > 0) note('PRIMARY_TRANSPORT_RATE', `${step.stepId}: sem vazão válida, o passo não transporta volume.`,
        { stageId: step.stageId, stepId: step.stepId, category: 'configuration', timeMin });
      return;
    }
    if (step.source === 'displacement' && !plugs.some(p => p.stageId === step.stageId && p.sealsOnLanding))
      diagnostics.push({ code: 'PRIMARY_DISPLACEMENT_NO_PLUG', severity: 'warning', category: 'placement',
        stageId: step.stageId, stepId: step.stepId, timeMin,
        message: `${step.stepId}: deslocamento bombeado sem plugue superior lançado; o volume alvo é contado após o lançamento.` });
    currentStepId = step.stepId;
    runInterval(step, step.fluidId, step.rateBpm, null, displacementTargetBbl);
  }

  function closeStage(stageId: string): void {
    const pending = plugs.find(p => p.stageId === stageId && p.sealsOnLanding && p.state === 'travelling');
    if (!pending) return;
    const md = plugMD(pending);
    note('PRIMARY_UNDERDISPLACEMENT',
      `${stageId}: o plugue superior parou acima do assento, deixando pasta no interior do revestimento.`,
      { stageId, timeMin, md: md ?? undefined, value: pending.travelledBbl, limit: pending.targetBbl,
        severity: 'warning' });
  }

  const placements = resolvePlacementOutcome(primary, program, contents, cells, returnedByFluid);
  for (const placement of placements) {
    if (placement.fragmented)
      diagnostics.push({ code: 'PRIMARY_PLACEMENT_FRAGMENTED', severity: 'warning', category: 'placement',
        stageId: placement.stageId, message: `${placement.placementId}: a pasta ficou em ${placement.actualIntervals.length} trechos separados; não é bainha contínua.` });
    if (placement.returnedBbl > VOLUME_EPS)
      diagnostics.push({ code: 'PRIMARY_CEMENT_RETURNED', severity: 'info', category: 'placement',
        stageId: placement.stageId, value: placement.returnedBbl,
        message: `${placement.placementId}: ${placement.returnedBbl} bbl de pasta retornaram à superfície.` });
  }
  checkTrackContent();

  function checkTrackContent(): void {
    const track = primary.retainedVolumes.find(v => v.kind === 'shoe-track');
    if (!track || track.kind !== 'shoe-track') return;
    const expected = new Set(primary.stages.flatMap(stage => stage.placements
      .filter(p => p.retainedVolumeIds.includes(track.id)).map(p => p.fluidId)));
    if (!expected.size) return;
    const inside = [...contents.entries()].filter(([cellId]) => {
      const cell = cells.get(cellId);
      return cell?.zone === 'internal' && cell.topMD >= track.topMD && cell.bottomMD <= track.bottomMD;
    }).flatMap(([, parcels]) => parcels).filter(p => p.fluidId !== VOID);
    const wrong = inside.filter(p => !expected.has(p.fluidId));
    if (wrong.length)
      diagnostics.push({ code: 'PRIMARY_TRACK_CONTAMINATED', severity: 'warning', category: 'placement',
        md: track.topMD, value: totalOf(wrong),
        message: `Shoe track terminou com ${totalOf(wrong)} bbl de fluido diferente da pasta prevista.` });
  }

  const hasError = diagnostics.some(d => d.severity === 'error');
  return { snapshots, events, placements, inventory: inventory(), diagnostics,
    totalTimeMin: timeMin, totalPumpedBbl, halted,
    status: hasError ? 'invalid' : halted || diagnostics.some(d => d.severity === 'warning') ? 'partial' : 'complete' };
}

/** Colocação real: intervalos anulares por colocação, a partir das parcelas transportadas. */
function resolvePlacementOutcome(primary: PrimaryConfiguration, program: PrimaryProgramVolumes,
  contents: CellContents, cells: Map<string, PrimaryCircuitCell>,
  returnedByFluid: Map<string, number>): PrimaryPlacementOutcome[] {
  const intervalsByFluid = new Map<string, { topMD: number; bottomMD: number }[]>();
  const annular = [...contents.entries()]
    .map(([cellId, parcels]) => ({ cell: cells.get(cellId)!, parcels }))
    .filter(entry => entry.cell?.zone === 'casing-annulus' && entry.cell.bottomMD > entry.cell.topMD)
    .sort((a, b) => a.cell.topMD - b.cell.topMD);
  for (const { cell, parcels } of annular) {
    const capacity = (cell.bottomMD - cell.topMD) / cell.volumeBbl;
    let cursor = cell.topMD;
    for (const parcel of parcels) {
      const bottomMD = cursor + parcel.volumeBbl * capacity;
      const list = intervalsByFluid.get(parcel.fluidId) ?? [];
      const last = list.at(-1);
      if (last && Math.abs(last.bottomMD - cursor) <= 1e-6) last.bottomMD = bottomMD;
      else list.push({ topMD: cursor, bottomMD });
      intervalsByFluid.set(parcel.fluidId, list);
      cursor = bottomMD;
    }
  }
  const claimed = new Set<string>();
  return program.stages.flatMap(stage => stage.placements.map(placement => {
    // Um fluido usado em várias colocações reporta seus intervalos uma vez só.
    const intervals = claimed.has(placement.fluidId) ? [] : intervalsByFluid.get(placement.fluidId) ?? [];
    claimed.add(placement.fluidId);
    return { stageId: stage.stageId, placementId: placement.placementId, fluidId: placement.fluidId,
      plannedVolumeBbl: placement.plannedBbl, programmedVolumeBbl: placement.programmedBbl,
      actualIntervals: intervals, returnedBbl: returnedByFluid.get(placement.fluidId) ?? 0,
      fragmented: intervals.length > 1,
      actualTocMD: intervals.length ? Math.min(...intervals.map(i => i.topMD)) : null };
  }));
}

