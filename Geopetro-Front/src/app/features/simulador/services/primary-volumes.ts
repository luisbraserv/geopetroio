import type { CementPlacement, CementingStage, PrimaryConfiguration, PrimaryDiagnostic, PrimaryPumpQuantity } from '../models/primary-cementing.model';
import type { PrimaryGeometrySegment, PrimaryResolvedAccessory, PrimaryStageGeometryResolution } from '../models/primary-geometry.model';
import type { PrimaryPlacementVolume, PrimaryPreflushBasis, PrimaryProgramVolumes, PrimaryStageVolumes, PrimaryStepVolume, PrimaryTocResolution } from '../models/primary-volumes.model';
import { primaryGeometryVolume } from './primary-geometry';

/** Fecha frações e fronteiras sem esconder desvio de programa. */
const EPS = 1e-9;
const closeTo = (value: number, target: number): boolean => Math.abs(value - target) <= Math.max(1e-8, 1e-8 * Math.abs(target));

/**
 * Topo ideal de uma coluna anular contínua a partir de um volume conhecido.
 * Consome os trechos de baixo para cima; cavidades são pontos, não deslocam o topo.
 * Excedente acima da superfície é cimento retornado, nunca TOC negativo.
 */
export function primaryAnnularFillTop(segments: PrimaryGeometrySegment[], accessories: PrimaryResolvedAccessory[],
  bottomMD: number, volumeBbl: number): PrimaryTocResolution | null {
  if (![bottomMD, volumeBbl].every(Number.isFinite) || volumeBbl < 0 || !segments.length) return null;
  const ordered = segments.filter(s => s.topMD < bottomMD).sort((a, b) => b.topMD - a.topMD);
  if (!ordered.length) return null;
  const cavities = (segmentId: string, md: number) => accessories
    .filter(a => a.zone === 'casing-annulus' && a.ownerSegmentId === segmentId && a.md === md)
    .reduce((sum, a) => sum + a.volumeBbl, 0);
  let remaining = volumeBbl;
  let tocMD = bottomMD;
  for (const segment of ordered) {
    const segmentBottom = Math.min(segment.bottomMD, bottomMD);
    for (const md of [segmentBottom, segment.topMD]) {
      if (md === segment.topMD) {
        const capacity = segment.annularCapacityBblM;
        if (!Number.isFinite(capacity) || capacity <= 0) return null;
        const full = (segmentBottom - segment.topMD) * capacity;
        if (remaining <= full + EPS) {
          tocMD = remaining >= full ? segment.topMD : segmentBottom - remaining / capacity;
          return { tocMD, returnedBbl: 0, placedBbl: volumeBbl, reachedSurface: tocMD <= 0 };
        }
        remaining -= full;
        tocMD = segment.topMD;
      }
      const cavity = cavities(segment.id, md);
      if (cavity <= 0) continue;
      if (remaining <= cavity + EPS) return { tocMD: md, returnedBbl: 0, placedBbl: volumeBbl, reachedSurface: md <= 0 };
      remaining -= cavity;
      tocMD = md;
    }
  }
  // Chegou à superfície: o excedente é cimento retornado, e o topo não passa de zero.
  return { tocMD: Math.max(0, tocMD), returnedBbl: remaining, placedBbl: volumeBbl - remaining, reachedSurface: true };
}

/** Dimensionamento por intervalo e programa; não transporta fluido nem calcula pressão. */
export function resolvePrimaryProgramVolumes(primary: PrimaryConfiguration,
  geometry: PrimaryStageGeometryResolution): PrimaryProgramVolumes {
  const diagnostics: PrimaryDiagnostic[] = [];
  const add = (code: string, message: string, extra: Partial<PrimaryDiagnostic> = {}): void => {
    diagnostics.push({ code, message, severity: 'error', category: 'placement', ...extra });
  };
  const empty = (): PrimaryProgramVolumes => ({ stages: [], totalPumpedBbl: 0, totalCementPlannedBbl: 0,
    totalCementProgrammedBbl: 0, totalTimeMin: 0, valid: false, diagnostics });
  if (!geometry.stages.length || !geometry.inventoryCapacities || geometry.issues.some(i => i.level === 'error')) {
    add('PRIMARY_VOLUMES_GEOMETRY', 'A geometria dos estágios precisa estar válida antes do dimensionamento.',
      { category: 'configuration' });
    return empty();
  }
  const segments = geometry.fullGeometry.segments;
  const annular = (top: number, bottom: number): number | null => {
    try { return primaryGeometryVolume(segments, 'casing-annulus', top, bottom); } catch { return null; }
  };
  const retainedById = new Map(primary.retainedVolumes.map(v => [v.id, v]));
  const retainedVolumeBbl = (id: string): number | null => {
    const retained = retainedById.get(id);
    if (!retained) return null;
    if (retained.kind === 'accessory') return geometry.accessories.find(a => a.id === id)?.volumeBbl ?? null;
    const internal = (() => {
      try { return primaryGeometryVolume(segments, 'internal', retained.topMD, retained.bottomMD); } catch { return null; }
    })();
    if (internal === null) return null;
    const cavities = geometry.accessories.filter(a => a.zone === 'internal' &&
      a.md >= retained.topMD && a.md <= retained.bottomMD &&
      segments.some(s => s.id === a.ownerSegmentId && s.topMD >= retained.topMD && s.bottomMD <= retained.bottomMD));
    return internal + cavities.reduce((sum, a) => sum + a.volumeBbl, 0);
  };

  const assignedRetained = new Map<string, string>();
  const occupied: { stageId: string; topMD: number; bottomMD: number }[] = [];
  const stages: PrimaryStageVolumes[] = [];
  for (let index = 0; index < primary.stages.length; index++) {
    const stage = primary.stages[index];
    const stageGeometry = geometry.stages.find(s => s.stageId === stage.id);
    if (!stageGeometry) continue;
    // Coluna de trabalho: o volume de pasta vem do dimensionamento do tampão/squeeze e
    // entra no programa como volume informado; não há intervalo anular a preencher.
    const workString = primary.target?.kind === 'work-string';
    if (workString && stage.placements.length)
      add('PRIMARY_WORKSTRING_PLACEMENT', `${stage.name}: a coluna de trabalho não dimensiona pasta por intervalo; informe o volume no programa.`,
        { stageId: stage.id, category: 'configuration' });
    const placements = workString ? [] : resolveStagePlacements(stage, index, primary, annular, retainedVolumeBbl,
      assignedRetained, occupied, geometry.accessories, segments, add);
    const steps = resolveStageSteps(stage, stageGeometry.displacementBbl, placements, primary, add);
    for (const placement of placements) {
      const own = steps.filter(s => s.placementId === placement.placementId && s.source !== 'displacement');
      placement.stepIds = own.map(s => s.stepId);
      placement.fractionSum = own.filter(s => s.source === 'placement')
        .reduce((sum, s) => sum + (s.fraction ?? 0), 0);
      placement.reserveExtraBbl = own.filter(s => s.source === 'reserve-extra').reduce((sum, s) => sum + s.volumeBbl, 0);
      placement.programmedBbl = own.reduce((sum, s) => sum + s.volumeBbl, 0);
      placement.preparedBbl = placement.programmedBbl + placement.mixingReserveBbl;
      if (!own.some(s => s.source === 'placement'))
        add('PRIMARY_PLACEMENT_NO_STEPS', `${placement.placementId}: pasta planejada sem nenhum passo de bombeio; programa incompleto.`,
          { stageId: stage.id });
      else if (!closeTo(placement.fractionSum, 1))
        add('PRIMARY_PLACEMENT_FRACTIONS', `${placement.placementId}: as frações dos passos somam ${placement.fractionSum}, não 1.`,
          { stageId: stage.id, value: placement.fractionSum, limit: 1 });
    }
    const displacementSteps = steps.filter(s => s.source === 'displacement');
    const displacementProgrammedBbl = displacementSteps.reduce((sum, s) => sum + s.volumeBbl, 0);
    const displacementFractionSum = displacementSteps.reduce((sum, s) => sum + (s.fraction ?? 0), 0);
    if (displacementSteps.length && !closeTo(displacementFractionSum, 1))
      add('PRIMARY_DISPLACEMENT_FRACTIONS', `${stage.name}: as frações de deslocamento somam ${displacementFractionSum}, não 1.`,
        { stageId: stage.id, value: displacementFractionSum, limit: 1 });
    const enteredCementBbl = steps.filter(s => s.kind === 'pump'
      && primary.fluids.find(f => f.id === s.fluidId)?.kind === 'cement').reduce((sum, s) => sum + s.volumeBbl, 0);
    const cementPlannedBbl = workString ? enteredCementBbl : placements.reduce((sum, p) => sum + p.plannedBbl, 0);
    const cementProgrammedBbl = workString ? enteredCementBbl : placements.reduce((sum, p) => sum + p.programmedBbl, 0);
    const annularCement = cementProgrammedBbl - placements.reduce((sum, p) => sum + p.retainedBbl, 0);
    stages.push({ stageId: stage.id, targetTocMD: stage.targetTocMD, outletMD: stage.outletMD,
      placements, steps, cementPlannedBbl, cementProgrammedBbl,
      displacementTargetBbl: stageGeometry.displacementBbl, displacementProgrammedBbl, displacementFractionSum,
      totalPumpedBbl: steps.reduce((sum, s) => sum + s.volumeBbl, 0),
      totalTimeMin: steps.reduce((sum, s) => sum + s.durationMin, 0),
      // No tampão a pasta fica dos dois lados da coluna: o topo sai do transporte, não do anular cheio.
      idealToc: annularCement > 0 && !workString
        ? primaryAnnularFillTop(segments, geometry.accessories, stage.outletMD, annularCement) : null });
  }
  return { stages,
    totalPumpedBbl: stages.reduce((sum, s) => sum + s.totalPumpedBbl, 0),
    totalCementPlannedBbl: stages.reduce((sum, s) => sum + s.cementPlannedBbl, 0),
    totalCementProgrammedBbl: stages.reduce((sum, s) => sum + s.cementProgrammedBbl, 0),
    totalTimeMin: stages.reduce((sum, s) => sum + s.totalTimeMin, 0),
    valid: !diagnostics.some(d => d.severity === 'error'), diagnostics };
}

function resolveStagePlacements(stage: CementingStage, index: number, primary: PrimaryConfiguration,
  annular: (top: number, bottom: number) => number | null,
  retainedVolumeBbl: (id: string) => number | null,
  assignedRetained: Map<string, string>,
  occupied: { stageId: string; topMD: number; bottomMD: number }[],
  accessories: PrimaryResolvedAccessory[], segments: PrimaryGeometrySegment[],
  add: (code: string, message: string, extra?: Partial<PrimaryDiagnostic>) => void): PrimaryPlacementVolume[] {
  const resolved: PrimaryPlacementVolume[] = [];
  const sorted = [...stage.placements].sort((a, b) => a.topMD - b.topMD);
  let cursor = stage.targetTocMD;
  for (const placement of sorted) {
    if (![placement.topMD, placement.bottomMD].every(Number.isFinite) || placement.bottomMD <= placement.topMD) {
      add('PRIMARY_PLACEMENT_RANGE', `${placement.id}: informe um intervalo finito e crescente.`, { stageId: stage.id });
      continue;
    }
    if (placement.topMD < stage.targetTocMD || placement.bottomMD > stage.outletMD)
      add('PRIMARY_PLACEMENT_BOUNDS', `${placement.id}: o intervalo deve ficar entre o TOC alvo e a saída ativa.`,
        { stageId: stage.id, md: placement.topMD });
    else if (placement.topMD !== cursor)
      add('PRIMARY_PLACEMENT_GAP', placement.topMD > cursor
        ? `${placement.id}: intervalo descontínuo; o trecho ${cursor}–${placement.topMD} m ficaria sem pasta dimensionada.`
        : `${placement.id}: intervalo sobreposto ao anterior no mesmo estágio.`,
        { stageId: stage.id, md: placement.topMD });
    cursor = Math.max(cursor, placement.bottomMD);
    // Trecho já cimentado em estágio anterior não volta a ser dimensionado como se tivesse lama.
    const conflict = occupied.find(o => placement.topMD < o.bottomMD - EPS && placement.bottomMD > o.topMD + EPS);
    if (conflict)
      add('PRIMARY_PLACEMENT_STAGE_CONFLICT', `${placement.id}: o intervalo já foi dimensionado no estágio ${conflict.stageId}; ajuste os intervalos.`,
        { stageId: stage.id, md: placement.topMD });
    const annularBbl = annular(placement.topMD, placement.bottomMD);
    if (annularBbl === null) {
      add('PRIMARY_PLACEMENT_CAPACITY', `${placement.id}: o intervalo não tem capacidade anular resolvida.`, { stageId: stage.id });
      continue;
    }
    resolved.push({ stageId: stage.id, placementId: placement.id, fluidId: placement.fluidId,
      topMD: placement.topMD, bottomMD: placement.bottomMD, annularBbl,
      retainedBbl: resolveRetained(stage, index, placement, primary, retainedVolumeBbl, assignedRetained, add),
      retainedVolumeIds: [...placement.retainedVolumeIds],
      plannedBbl: 0, reserveExtraBbl: 0, programmedBbl: 0, preparedBbl: 0, fractionSum: 0, stepIds: [],
      mixingReserveBbl: resolveMixingReserve(stage, placement, add) });
    const last = resolved.at(-1)!;
    last.plannedBbl = last.annularBbl + last.retainedBbl;
    occupied.push({ stageId: stage.id, topMD: placement.topMD, bottomMD: placement.bottomMD });
    const loose = accessories.filter(a => a.zone === 'casing-annulus' && !placement.retainedVolumeIds.includes(a.id) &&
      !assignedRetained.has(a.id) && a.md >= placement.topMD && a.md <= placement.bottomMD &&
      segments.some(s => s.id === a.ownerSegmentId && s.topMD >= placement.topMD && s.bottomMD <= placement.bottomMD));
    for (const accessory of loose)
      add('PRIMARY_RETAINED_UNASSIGNED', `${accessory.id}: cavidade anular dentro do intervalo de ${placement.id} sem atribuição; o volume ficaria subdimensionado.`,
        { stageId: stage.id, md: accessory.md, severity: 'warning' });
  }
  if (resolved.length && Number.isFinite(cursor) && cursor !== stage.outletMD)
    add('PRIMARY_PLACEMENT_GAP', `${stage.name}: o trecho ${cursor}–${stage.outletMD} m entre o TOC alvo e a saída ativa ficou sem pasta dimensionada.`,
      { stageId: stage.id, md: cursor });
  if (!stage.placements.length)
    add('PRIMARY_PLACEMENT_MISSING', `${stage.name}: informe ao menos um intervalo de pasta.`, { stageId: stage.id });
  return resolved;
}

function resolveMixingReserve(stage: CementingStage, placement: CementPlacement,
  add: (code: string, message: string, extra?: Partial<PrimaryDiagnostic>) => void): number {
  const reserve = placement.mixingReserveBbl;
  if (reserve === undefined) return 0;
  if (!Number.isFinite(reserve) || reserve < 0) {
    add('PRIMARY_MIXING_RESERVE', `${placement.id}: a reserva de mistura deve ser um volume finito não negativo.`, { stageId: stage.id });
    return 0;
  }
  return reserve;
}

function resolveRetained(stage: CementingStage, index: number, placement: CementPlacement,
  primary: PrimaryConfiguration, retainedVolumeBbl: (id: string) => number | null,
  assignedRetained: Map<string, string>,
  add: (code: string, message: string, extra?: Partial<PrimaryDiagnostic>) => void): number {
  let total = 0;
  for (const id of placement.retainedVolumeIds) {
    const retained = primary.retainedVolumes.find(v => v.id === id);
    if (!retained) {
      add('PRIMARY_RETAINED_UNKNOWN', `${id}: volume retido inexistente.`, { stageId: stage.id });
      continue;
    }
    // O shoe track pertence ao primeiro circuito; repetir por estágio inflaria a pasta.
    if (retained.kind === 'shoe-track' && index > 0) {
      add('PRIMARY_TRACK_STAGE', `${id}: o shoe track é volume retido do primeiro circuito e não se repete em outros estágios.`,
        { stageId: stage.id });
      continue;
    }
    const owner = assignedRetained.get(id);
    if (owner) {
      add('PRIMARY_RETAINED_REUSED', `${id}: volume retido já atribuído em ${owner}; não somar novamente.`,
        { stageId: stage.id });
      continue;
    }
    const volume = retainedVolumeBbl(id);
    if (volume === null || !Number.isFinite(volume) || volume < 0) {
      add('PRIMARY_RETAINED_VOLUME', `${id}: volume retido sem capacidade resolvida.`, { stageId: stage.id });
      continue;
    }
    assignedRetained.set(id, placement.id);
    total += volume;
  }
  return total;
}

function resolveStageSteps(stage: CementingStage, displacementTargetBbl: number,
  placements: PrimaryPlacementVolume[], primary: PrimaryConfiguration,
  add: (code: string, message: string, extra?: Partial<PrimaryDiagnostic>) => void): PrimaryStepVolume[] {
  const steps: PrimaryStepVolume[] = [];
  for (const step of stage.steps) {
    if (step.kind === 'pause') {
      if (!Number.isFinite(step.durationMin) || step.durationMin < 0)
        add('PRIMARY_PAUSE_DURATION', `${step.id}: a pausa precisa de duração finita não negativa.`,
          { stageId: stage.id, stepId: step.id, category: 'configuration' });
      steps.push({ stageId: stage.id, stepId: step.id, kind: 'pause', fluidId: null, source: null,
        placementId: null, fraction: null, volumeBbl: 0, rateBpm: null, durationMin: Math.max(0, step.durationMin) });
      continue;
    }
    if (step.kind === 'tool-event') {
      steps.push({ stageId: stage.id, stepId: step.id, kind: 'tool-event', fluidId: null, source: null,
        placementId: null, fraction: null, volumeBbl: 0, rateBpm: null, durationMin: 0 });
      continue;
    }
    const fluid = primary.fluids.find(f => f.id === step.fluidId);
    if (!fluid) {
      add('PRIMARY_STEP_FLUID', `${step.id}: fluido inexistente.`, { stageId: stage.id, stepId: step.id, category: 'configuration' });
      continue;
    }
    const quantity = step.quantity;
    // Cimento dimensionado nunca entra por volume digitado: o total vem do TOC e da geometria.
    if (fluid.kind === 'cement' && primary.target?.kind !== 'work-string'
      && quantity.source !== 'placement' && quantity.source !== 'reserve-extra')
      add('PRIMARY_CEMENT_QUANTITY', `${step.id}: pasta deve usar colocação dimensionada ou reserva extra explícita.`,
        { stageId: stage.id, stepId: step.id });
    const basis = quantity.source === 'preflush'
      ? preflushBasis(stage, step.id, quantity, step.rateBpm, fluid.kind, placements, add) : null;
    const volumeBbl = quantity.source === 'preflush'
      ? basis ? basis.overrideBbl ?? basis.calculatedBbl : null
      : stepVolume(stage, step.id, quantity, displacementTargetBbl, placements, add);
    if (volumeBbl === null) continue;
    if (volumeBbl > 0 && (!Number.isFinite(step.rateBpm) || step.rateBpm <= 0))
      add('PRIMARY_RATE_REQUIRED', `${step.id}: volume positivo exige vazão positiva.`,
        { stageId: stage.id, stepId: step.id, category: 'configuration' });
    const rateBpm = Number.isFinite(step.rateBpm) && step.rateBpm > 0 ? step.rateBpm : null;
    steps.push({ stageId: stage.id, stepId: step.id, kind: 'pump', fluidId: fluid.id,
      source: quantity.source, volumeBbl, rateBpm,
      fraction: quantity.source === 'placement' || quantity.source === 'displacement' ? quantity.fraction : null,
      placementId: quantity.source === 'placement' || quantity.source === 'reserve-extra' ? quantity.placementId : null,
      durationMin: rateBpm ? volumeBbl / rateBpm : 0, ...(basis ? { preflush: basis } : {}) });
  }
  return steps;
}

/**
 * Colchão calculado (PREFLUSH_DEFAULTS): V = máx(t·Q, L·C), com Q a vazão do passo e C a
 * capacidade anular da pasta de fundo do estágio, a que cobre a saída ativa. C vem do
 * dimensionamento da pasta (volume anular do intervalo sobre a altura dele), com caliper
 * e excesso; sem intervalo de pasta, só o tempo de contato vale.
 */
function preflushBasis(stage: CementingStage, stepId: string,
  quantity: Extract<PrimaryPumpQuantity, { source: 'preflush' }>, rateBpm: number,
  kind: string, placements: PrimaryPlacementVolume[],
  add: (code: string, message: string, extra?: Partial<PrimaryDiagnostic>) => void): PrimaryPreflushBasis | null {
  const invalid = (code: string, message: string): null => {
    add(code, `${stepId}: ${message}`, { stageId: stage.id, stepId, category: 'configuration' });
    return null;
  };
  if (kind !== 'wash' && kind !== 'spacer')
    return invalid('PRIMARY_PREFLUSH_FLUID', 'só lavador e espaçador têm volume calculado pelo simulador.');
  const { contactTimeMin, annularLengthM, overrideBbl } = quantity;
  if (![contactTimeMin, annularLengthM].every(v => Number.isFinite(v) && v >= 0) || contactTimeMin + annularLengthM <= 0)
    return invalid('PRIMARY_PREFLUSH_CRITERIA', 'informe tempo de contato ou comprimento anular positivos.');
  if (overrideBbl !== null && !(Number.isFinite(overrideBbl) && overrideBbl >= 0))
    return invalid('PRIMARY_STEP_VOLUME', 'informe um volume finito não negativo.');
  const rate = Number.isFinite(rateBpm) && rateBpm > 0 ? rateBpm : 0;
  const bottom = [...placements].sort((a, b) => b.bottomMD - a.bottomMD)[0];
  const capacity = bottom && bottom.bottomMD > bottom.topMD ? bottom.annularBbl / (bottom.bottomMD - bottom.topMD) : null;
  if (annularLengthM > 0 && capacity === null && overrideBbl === null)
    add('PRIMARY_PREFLUSH_NO_ZONE', `${stepId}: sem intervalo de pasta no estágio, o comprimento anular não entra; vale só o tempo de contato.`,
      { stageId: stage.id, stepId, category: 'configuration', severity: 'warning' });
  const contactBbl = contactTimeMin * rate;
  const annularBbl = capacity === null ? 0 : annularLengthM * capacity;
  return { contactTimeMin, rateBpm: rate, contactBbl, annularLengthM, capacityBblM: capacity, placementId: bottom?.placementId ?? null,
    annularBbl, calculatedBbl: Math.max(contactBbl, annularBbl),
    governing: annularBbl > contactBbl ? 'annular' : 'contact', overrideBbl };
}

function stepVolume(stage: CementingStage, stepId: string,
  quantity: Exclude<PrimaryPumpQuantity, { source: 'preflush' }>,
  displacementTargetBbl: number, placements: PrimaryPlacementVolume[],
  add: (code: string, message: string, extra?: Partial<PrimaryDiagnostic>) => void): number | null {
  const invalid = (code: string, message: string): null => {
    add(code, `${stepId}: ${message}`, { stageId: stage.id, stepId, category: 'configuration' });
    return null;
  };
  if (quantity.source === 'entered')
    return Number.isFinite(quantity.volumeBbl) && quantity.volumeBbl >= 0
      ? quantity.volumeBbl : invalid('PRIMARY_STEP_VOLUME', 'informe um volume finito não negativo.');
  if (quantity.source === 'displacement') {
    if (quantity.deviceId !== stage.deviceId)
      return invalid('PRIMARY_DISPLACEMENT_DEVICE', 'o deslocamento deve referenciar o dispositivo do próprio estágio.');
    return Number.isFinite(quantity.fraction) && quantity.fraction > 0
      ? quantity.fraction * displacementTargetBbl : invalid('PRIMARY_STEP_FRACTION', 'informe uma fração positiva.');
  }
  const placement = placements.find(p => p.placementId === quantity.placementId);
  if (!placement) return invalid('PRIMARY_STEP_PLACEMENT', 'colocação inexistente ou não dimensionada.');
  if (quantity.source === 'reserve-extra')
    return Number.isFinite(quantity.volumeBbl) && quantity.volumeBbl > 0
      ? quantity.volumeBbl : invalid('PRIMARY_RESERVE_VOLUME', 'a reserva extra precisa de volume positivo.');
  return Number.isFinite(quantity.fraction) && quantity.fraction > 0
    ? quantity.fraction * placement.plannedBbl : invalid('PRIMARY_STEP_FRACTION', 'informe uma fração positiva.');
}
