import type { PressureProfileInput } from '../models/pressure-profile.model';
import { gradientsAt, profileWindowRows } from './pressure-profile';
import type { PrimaryConfiguration, PrimaryFluid, PrimaryFrictionLevel, PrimaryPropertySource,
  PrimaryPumpStep, PrimaryReference } from '../models/primary-cementing.model';
import type { AnnularPressureDepthPoint, SqueezeHydraulicPoint, SqueezeHydraulicSimulation } from '../models/squeeze.model';
import type { OrigemReologia } from '../models/aditivo.model';
import type { PlugGeometry } from '../models/tampao.model';
import type { WellGeometry } from '../models/well-geometry.model';
import { OPERATION_FLUID_COLORS, summarizeHydroEcd, type OperationChartPhase, type OperationCharts, type OperationHydroEcdPoint, type OperationVolumeSeries, envelopeWithStaticState, type OperationHydroEcdMarker } from './operation-charts';
import { K } from './primary-hydraulics';
import { buildPrimaryOperationCharts, primarySimplifiedRheologyWarning } from './primary-operation-charts';
import type { PrimaryProgramResolution, PrimaryProgramService } from './primary-program.service';
import { retiradaTubos, type RetiradaTubosResult } from './retirada-tubos';
import { buildWorkStringConfiguration, WORK_STRING_ASSEMBLY_ID } from './work-string-config';
import { resolveWorkStringPull, type WorkStringPullResult } from './work-string-pull';

/**
 * Tampão balanceado no motor da primária (SPEC squeeze-tampao §6). O dimensionamento
 * de hoje (`TampaoCalculoService.calcPlug`) continua dono dos volumes; aqui eles viram
 * o programa da coluna de trabalho, e o resultado sai nos formatos que a tela usa:
 * os gráficos comuns e, para as métricas e o relatório de conformidade, o formato
 * da simulação antiga.
 */
/**
 * O que o motor lê do dimensionamento: intervalo, volumes do programa, topo sem coluna
 * (para a retirada) e capacidade da coluna. O squeeze Bradenhead e o packer montam o
 * mesmo recorte a partir da geometria do squeeze.
 */
export type TampaoPlacement = Pick<PlugGeometry, 'pTop' | 'pBase' | 'frontPhysicalVolumeBbl' | 'volCementTotal'
  | 'backPhysicalVolumeBbl' | 'volDisplacement' | 'topCementWithoutTubing' | 'capPipe'>;

export interface TampaoEngineInput {
  geometry: WellGeometry;
  plug: TampaoPlacement;
  pipeODIn: number;
  pipeIDIn: number;
  densities: { completion: number; front: number; back: number; displacement: number; slurry: number };
  waterViscosityCp: number;
  /**
   * n e k da pasta (lei de potência). Na tela, a reologia de referência da primária
   * (R3 §12-7, pasta tail), com a referência que aparece como origem da propriedade.
   */
  slurryRheology: { n: number; kLbfSnFt2: number; origin: OrigemReologia; reference?: string };
  rates: { front: number; slurry: number; back: number; displacement: number };
  pausesMin: [number, number, number];
  /** Multiplicadores de atrito do interior e do anular, os da primária (R3 §4-6 × 1,00 / 1,15 / 1,35). */
  friction: { internal: PrimaryFrictionLevel; annular: PrimaryFrictionLevel };
  headCondition: PrimaryConfiguration['headCondition'];
  poreGradPpg: number;
  fracGradPpg: number;
  /** Poro e fratura por TVD (janela operacional); sem ele, os dois gradientes acima em todo o poço. */
  pressureProfile?: PressureProfileInput | null;
  equipment: { maxSurfacePressurePsi: number | null; maxPumpRateBpm: number | null; motorHp: number | null; pumpEffPct: number | null };
  retirada?: { tubeLengthM?: number; sectionsAboveTop?: number; tubesPerSection?: number };
  /** Janela de poro e fratura; padrão, a seção de interesse (o tampão). O squeeze passa os canhoneados. */
  pressureWindow?: PrimaryConfiguration['pressureWindow'];
  /** Referências além da base do tampão (os canhoneados do squeeze). */
  extraReferences?: PrimaryReference[];
}

/** Sobreposições da varredura do relatório de conformidade. */
export interface TampaoEngineOverrides { rateFactor?: number; density?: number; displacementFactor?: number }

export interface TampaoEngineSummary {
  /** Hidrostática da coluna − do anular na extremidade, no fim do bombeio (positivo: coluna mais pesada). */
  imbalanceEndPumpPsi: number | null;
  drainedBbl: number | null;
  settleMin: number | null;
  residualImbalancePsi: number | null;
  settleTimedOut: boolean;
  backflowPsi: number | null;
  cementTopAfterPullMD: number | null;
  esdBaseBeforePullPpg: number | null;
  esdBaseAfterPullPpg: number | null;
  totalTimeMin: number;
}

export interface TampaoEngineResult {
  primary: PrimaryConfiguration;
  resolution: PrimaryProgramResolution;
  retirada: RetiradaTubosResult;
  pull: WorkStringPullResult | null;
  summary: TampaoEngineSummary;
}

const CP_TO_LBF_S_FT2 = 2.0885e-5;
const ORIGIN_LABELS: Record<OrigemReologia, string> = { laboratorio: 'Leituras de laboratório', theta: 'Leituras θ informadas',
  catalogo: 'Catálogo de aditivos', estimado: 'Estimativa por aditivos', base: 'Pasta de referência' };
const SETTLE_MAX_MIN = 120;
export const TAMPAO_PLUG_BASE_REFERENCE = 'plug-base';
export const TAMPAO_STEP_LABELS: Record<string, string> = {
  front: 'Água à frente', 'pause-1': 'Pausa 1', slurry: 'Pasta', 'pause-2': 'Pausa 2',
  back: 'Água atrás', 'pause-3': 'Pausa 3', displace: 'Deslocamento', settle: 'Equilíbrio do tampão',
};

/** Os fluidos da coluna de trabalho (§6.2): completação, águas, pasta e deslocamento. Também do squeeze. */
export function workStringFluids(input: Pick<TampaoEngineInput, 'densities' | 'waterViscosityCp' | 'slurryRheology'>,
  slurryDensity: number): PrimaryFluid[] {
  const water = (id: string, kind: PrimaryFluid['kind'], name: string, densityPpg: number): PrimaryFluid => ({
    id, kind, name, densityPpg,
    rheology: { model: 'power-law', n: 1, kLbfSnFt2: Math.max(0.2, input.waterViscosityCp || 1) * CP_TO_LBF_S_FT2 },
    propertySources: { densityPpg: { source: 'entered' }, n: { source: 'entered', reference: 'Viscosidade da água' },
      kLbfSnFt2: { source: 'entered', reference: 'Viscosidade da água' } } });
  const origin = input.slurryRheology.origin;
  const slurrySource: PrimaryPropertySource = { source: origin === 'laboratorio' || origin === 'theta' ? 'measured' : 'estimated',
    reference: input.slurryRheology.reference ?? ORIGIN_LABELS[origin] };
  return [
    water('completion', 'mud', 'Fluido de completação', input.densities.completion),
    water('front', 'wash', 'Água à frente', input.densities.front),
    { id: 'slurry', kind: 'cement', name: `Pasta ${slurryDensity.toFixed(1)} ppg`, densityPpg: slurryDensity,
      rheology: { model: 'power-law', n: input.slurryRheology.n, kLbfSnFt2: input.slurryRheology.kLbfSnFt2 },
      propertySources: { densityPpg: { source: 'entered' }, n: slurrySource, kLbfSnFt2: slurrySource } },
    water('back', 'wash', 'Água atrás', input.densities.back),
    water('displacement', 'displacement', 'Deslocamento', input.densities.displacement),
  ];
}

function tampaoSteps(input: TampaoEngineInput, o: TampaoEngineOverrides): PrimaryPumpStep[] {
  const f = o.rateFactor ?? 1;
  const pump = (id: string, fluidId: string, volumeBbl: number, rateBpm: number): PrimaryPumpStep[] =>
    volumeBbl > 1e-9 ? [{ id, kind: 'pump', fluidId, rateBpm: rateBpm * f, quantity: { source: 'entered', volumeBbl } }] : [];
  const pause = (id: string, minutes: number): PrimaryPumpStep[] =>
    minutes > 0 ? [{ id, kind: 'pause', durationMin: minutes }] : [];
  const plug = input.plug;
  return [
    ...pump('front', 'front', plug.frontPhysicalVolumeBbl, input.rates.front),
    ...pause('pause-1', input.pausesMin[0]),
    ...pump('slurry', 'slurry', plug.volCementTotal, input.rates.slurry),
    ...pause('pause-2', input.pausesMin[1]),
    ...pump('back', 'back', plug.backPhysicalVolumeBbl, input.rates.back),
    ...pause('pause-3', input.pausesMin[2]),
    ...pump('displace', 'displacement', plug.volDisplacement * (o.displacementFactor ?? 1), input.rates.displacement),
    { id: 'settle', kind: 'pause', durationMin: SETTLE_MAX_MIN, untilBalanced: true },
  ];
}

export function buildTampaoConfiguration(input: TampaoEngineInput, o: TampaoEngineOverrides = {}): PrimaryConfiguration {
  const plug = input.plug;
  const slurryDensity = o.density ?? input.densities.slurry;
  return buildWorkStringConfiguration(input.geometry, {
    openEndMD: plug.pBase,
    sections: [{ topMD: 0, bottomMD: plug.pBase, idIn: input.pipeIDIn, odIn: input.pipeODIn }],
    fluids: workStringFluids(input, slurryDensity),
    initialFluidId: 'completion',
    steps: tampaoSteps(input, o),
    headCondition: input.headCondition,
    returnPressurePsi: 0,
    // O mesmo atrito da primária: R3 §4-6 por fluido com os multiplicadores de interior e anular.
    friction: { internal: input.friction.internal, annular: input.friction.annular },
    // A seção de interesse, como hoje; o motor só conta violação onde há poço aberto.
    // O poço inteiro com os gradientes da tela: o motor só aplica a janela onde há formação
    // exposta (o poço aberto), e é só lá que poro e fratura aparecem no envelope.
    pressureWindow: input.pressureWindow ?? [{ topMD: 0, bottomMD: input.geometry.finalMD, topPorePpg: input.poreGradPpg,
      porePpg: input.poreGradPpg, topFracturePpg: input.fracGradPpg, fracturePpg: input.fracGradPpg }],
    equipmentLimits: { maxPressurePsi: input.equipment.maxSurfacePressurePsi || null,
      maxRateBpm: input.equipment.maxPumpRateBpm || null, motorHp: input.equipment.motorHp || null,
      efficiency: input.equipment.pumpEffPct ? input.equipment.pumpEffPct / 100 : null },
  });
}

export function runTampaoEngine(service: PrimaryProgramService, input: TampaoEngineInput,
  tvdOf: (md: number) => number, o: TampaoEngineOverrides = {}): TampaoEngineResult {
  // Com o perfil por TVD, a janela do poço inteiro sai dele (janela operacional §3.2).
  const primary = buildTampaoConfiguration(input.pressureWindow || !input.pressureProfile ? input
    : { ...input, pressureWindow: profileWindowRows(input.pressureProfile, { topMD: 0, bottomMD: input.geometry.finalMD }, tvdOf) }, o);
  const references: PrimaryReference[] = [...(input.extraReferences ?? []), { id: TAMPAO_PLUG_BASE_REFERENCE, name: 'Base do tampão',
    md: input.plug.pBase, zone: 'casing-annulus', assemblyId: WORK_STRING_ASSEMBLY_ID }];
  const resolution = service.resolve(input.geometry, primary, references);
  const retirada = retiradaTubos({ baseDepthMD: input.plug.pBase, cementTopMD: input.plug.topCementWithoutTubing,
    ...input.retirada });
  const transport = resolution.transport;
  const last = transport?.snapshots.at(-1);
  const pull = transport && !transport.halted && transport.status !== 'invalid' && last
    ? resolveWorkStringPull(resolution.geometry.fullGeometry.segments, last, primary.fluids, 'completion',
      retirada.openEndDepthM, tvdOf) : null;
  return { primary, resolution, retirada, pull, summary: summarize(resolution, pull, input, tvdOf) };
}

function summarize(resolution: PrimaryProgramResolution, pull: WorkStringPullResult | null,
  input: TampaoEngineInput, tvdOf: (md: number) => number): TampaoEngineSummary {
  const points = resolution.hydraulics?.points ?? [];
  const imbalance = (p: typeof points[number] | undefined) => p && p.internalHydrostaticPsi !== null && p.annularHydrostaticPsi !== null
    ? p.internalHydrostaticPsi - p.annularHydrostaticPsi : null;
  const endPump = [...points].reverse().find(p => p.stepId === 'displace');
  const diagnostics = [...(resolution.transport?.diagnostics ?? []), ...(resolution.hydraulics?.diagnostics ?? [])];
  const settle = diagnostics.find(d => d.code === 'PRIMARY_SETTLE');
  const baseTVD = tvdOf(input.plug.pBase);
  const lastPoint = points.at(-1);
  return {
    imbalanceEndPumpPsi: imbalance(endPump),
    drainedBbl: settle?.value ?? null,
    settleMin: settle?.limit ?? null,
    residualImbalancePsi: imbalance(lastPoint),
    settleTimedOut: diagnostics.some(d => d.code === 'PRIMARY_SETTLE_TIMEOUT'),
    backflowPsi: diagnostics.find(d => d.code === 'PRIMARY_WORKSTRING_BACKFLOW')?.value ?? null,
    cementTopAfterPullMD: pull?.wellboreTopOf('slurry') ?? null,
    esdBaseBeforePullPpg: lastPoint?.annularHydrostaticPsi != null && baseTVD > 0 ? lastPoint.annularHydrostaticPsi / (K * baseTVD) : null,
    esdBaseAfterPullPpg: pull && baseTVD > 0 ? pull.hydrostaticPsiAt(input.plug.pBase) / (K * baseTVD) : null,
    totalTimeMin: resolution.transport?.totalTimeMin ?? 0,
  };
}

/** Série de volume pelo tempo real do transporte: a drenagem até o equilíbrio tem a duração calculada. */
export function volumeSeriesFromTransport(resolution: PrimaryProgramResolution, fluids: PrimaryFluid[]): OperationVolumeSeries[] {
  const snapshots = resolution.transport?.snapshots ?? [];
  const ids = [...new Set(resolution.volumes.stages.flatMap(stage => stage.steps)
    .filter(step => step.kind === 'pump' && !!step.fluidId && step.volumeBbl > 0).map(step => step.fluidId as string))];
  const pumped = (snapshot: typeof snapshots[number], id: string) =>
    snapshot.inventory.find(entry => entry.fluidId === id)?.pumpedBbl ?? 0;
  const byId = new Map(fluids.map(fluid => [fluid.id, fluid]));
  return [
    { id: 'total', label: 'Volume total injetado', color: '#051833', kind: 'total',
      points: snapshots.map(s => ({ timeMin: s.timeMin, volumeBbl: ids.reduce((sum, id) => sum + pumped(s, id), 0) })) },
    ...ids.map(id => ({ id, label: byId.get(id)?.name ?? id, color: OPERATION_FLUID_COLORS[byId.get(id)?.kind ?? 'mud'],
      kind: 'fluid' as const, points: snapshots.map(s => ({ timeMin: s.timeMin, volumeBbl: pumped(s, id) })) })),
  ];
}

/** Os três gráficos da primária para o tampão, com o estado depois da retirada no fim. */
export function buildTampaoOperationCharts(result: TampaoEngineResult, phases: OperationChartPhase[],
  operationPhaseId: string | null, tvdOf: (md: number) => number): OperationCharts | null {
  const hydraulics = result.resolution.hydraulics;
  if (!hydraulics) return null;
  const base = buildPrimaryOperationCharts(hydraulics, result.resolution.volumes, result.primary.fluids, phases,
    operationPhaseId, tvdOf);
  const plugBase = result.primary.target!.shoeMD;
  const baseTVD = tvdOf(plugBase);
  const points: OperationHydroEcdPoint[] = [...base.references[0].points];
  const pull = result.pull;
  // Depois da retirada: estado parado, marcado como ponto, fora da linha do bombeio.
  const last = points.at(-1);
  const marker: OperationHydroEcdMarker | null = pull && baseTVD > 0 ? { label: 'Depois da retirada',
    volumeBbl: last?.volumeBbl ?? 0, timeMin: last?.timeMin ?? 0, hydrostaticPsi: pull.hydrostaticPsiAt(plugBase),
    ecdPpg: pull.hydrostaticPsiAt(plugBase) / (K * baseTVD) } : null;
  // O envelope soma o estado depois da retirada: ECD máximo e hidrostática mínima.
  const envelope = pull ? envelopeWithStaticState(base.envelope, md => pull.hydrostaticPsiAt(md))
    : base.envelope.map(point => ({ ...point }));
  const phase = phases.find(entry => entry.id === operationPhaseId);
  const slurry = result.primary.fluids.find(fluid => fluid.id === 'slurry');
  return {
    ...base,
    operation: 'tampao',
    references: [{ id: TAMPAO_PLUG_BASE_REFERENCE, label: 'Base do tampão',
      title: 'ECD e pressão hidrostática na base do tampão',
      description: 'Hidrostática em psi à esquerda e ECD em ppg à direita, com as escalas amarradas pela TVD da base '
        + 'do tampão: as duas curvas coincidem sem atrito. O ponto marcado é o estado parado depois da retirada da coluna.',
      tvd: baseTVD, points, summary: summarizeHydroEcd(points, false), axis: 'volume', marker }],
    envelope,
    envelopeMarker: phase ? { label: 'Topo da fase da operação', md: phase.topMD } : null,
    volumes: volumeSeriesFromTransport(result.resolution, result.primary.fluids),
    // A regra da primária: só avisa quando a pasta está com a água simplificada de 1 cP.
    rheologyWarning: primarySimplifiedRheologyWarning(slurry ? [slurry] : []),
  };
}

/**
 * O resultado do motor novo no formato da simulação antiga, que as métricas da aba
 * Simulação e o relatório de conformidade leem. Os números são do motor novo; os
 * nomes dos campos são os antigos.
 */
export function tampaoLegacyHydraulics(result: TampaoEngineResult, input: TampaoEngineInput,
  tvdOf: (md: number) => number): SqueezeHydraulicSimulation | null {
  const hydraulics = result.resolution.hydraulics;
  if (!hydraulics) return null;
  const plug = input.plug;
  const referenceTVD = tvdOf(plug.pBase);
  const window = gradientsAt(input, referenceTVD);
  const porePsi = K * window.porePpg * referenceTVD;
  const fracturePsi = K * window.fracturePpg * referenceTVD;
  const tubingCap = plug.capPipe;
  let accum = 0;
  let previous: { t: number; extra: number } | null = null;
  // O estado final do motor vem sem passo: herda o nome da fase anterior.
  let phase = 'Início';
  const points: SqueezeHydraulicPoint[] = hydraulics.points.filter(p => p.bhpPsi !== null).map(p => {
    if (p.stepId) phase = TAMPAO_STEP_LABELS[p.stepId] ?? p.stepId;
    const outlet = p.outletRateBpm ?? p.pumpRateBpm;
    const extra = Math.max(0, outlet - p.pumpRateBpm);
    if (previous) accum += (previous.extra + extra) / 2 * Math.max(0, p.timeMin - previous.t);
    previous = { t: p.timeMin, extra };
    return { timeMin: p.timeMin, phase,
      pumpedVolumeBbl: p.pumpedVolumeBbl, injectedVolumeBbl: 0,
      programmedRateBpm: p.pumpRateBpm, realRateBpm: outlet, freeFallExtraRateBpm: extra,
      pumpPressurePsi: p.pumpPressurePsi ?? 0, surfacePressurePsi: 0,
      frictionPsi: p.pipeFrictionPsi ?? 0, annularFrictionPsi: p.annularFrictionPsi ?? 0,
      hydrostaticPsi: p.annularHydrostaticPsi ?? 0, bhpPsi: p.bhpPsi!, ecdPpg: p.ecdPpg,
      porePsi, fracturePsi, freeFallAccumBbl: accum, freeFallHeightM: tubingCap > 0 ? accum / tubingCap : 0,
      drivePsi: Math.max(0, p.uTubeDrivePsi ?? 0),
      hydraulicLossPsi: (p.pipeFrictionPsi ?? 0) + (p.annularFrictionPsi ?? 0) };
  });
  const bhps = points.map(p => p.bhpPsi);
  const ecds = points.map(p => p.ecdPpg).filter((v): v is number => v !== null && Number.isFinite(v));
  const bhpMaxPsi = bhps.length ? Math.max(...bhps) : 0;
  const bhpMinPsi = bhps.length ? Math.min(...bhps) : 0;
  const motorHP = Math.max(0, input.equipment.motorHp ?? 0);
  const pumpEff = Math.max(0, Math.min(100, input.equipment.pumpEffPct ?? 0));
  const hhpAvailable = motorHP > 0 && pumpEff > 0 ? motorHP * pumpEff / 100 : null;
  const hhpMaxRequired = points.reduce((m, p) => Math.max(m, p.pumpPressurePsi * p.programmedRateBpm / 40.8), 0);
  const maxPumpPressurePsi = points.reduce((m, p) => Math.max(m, p.pumpPressurePsi), 0);
  const maxProgrammedRateBpm = points.reduce((m, p) => Math.max(m, p.programmedRateBpm), 0);
  const equipmentAlerts: string[] = [];
  if (hhpAvailable != null && hhpMaxRequired > hhpAvailable)
    equipmentAlerts.push(`HHP exigido (${Math.round(hhpMaxRequired)}) excede o disponível (${Math.round(hhpAvailable)} = ${Math.round(motorHP)} HP × ${Math.round(pumpEff)}%)`);
  const maxSurface = input.equipment.maxSurfacePressurePsi ?? 0;
  if (maxSurface > 0 && maxPumpPressurePsi > maxSurface)
    equipmentAlerts.push(`Pressão de superfície (${Math.round(maxPumpPressurePsi)} psi) excede o limite da unidade (${Math.round(maxSurface)} psi)`);
  const maxRate = input.equipment.maxPumpRateBpm ?? 0;
  if (maxRate > 0 && maxProgrammedRateBpm > maxRate)
    equipmentAlerts.push(`Vazão programada (${maxProgrammedRateBpm.toFixed(1)} bpm) excede o limite da unidade (${maxRate.toFixed(1)} bpm)`);
  const d = input.densities;
  const rates = [input.rates.front, input.rates.slurry, input.rates.back, input.rates.displacement].filter(r => r > 0);
  const pressurePenalty = bhpMaxPsi > fracturePsi || bhpMinPsi < porePsi ? 24 : 0;
  const densityPenalty = d.slurry < d.back || d.slurry < d.front ? 12 : 0;
  const ratePenalty = rates.some(r => r < 0.5 || r > 8) ? 12 : 0;
  const freeFallPenalty = Math.min(18, accum * 2);
  const pauseTimeMin = result.resolution.volumes.stages.flatMap(s => s.steps)
    .filter(step => step.kind === 'pause' && step.stepId !== 'settle').reduce((sum, step) => sum + step.durationMin, 0);
  const envelope: AnnularPressureDepthPoint[] = hydraulics.envelope.map(e => ({ md: e.md, tvd: e.tvd,
    porePsi: e.porePsi, fracPsi: e.fracturePsi, maxAnnularPsi: e.maxAnnularPsi ?? 0, minAnnularPsi: e.minAnnularPsi ?? 0 }));
  return {
    categories: ['Pressão e deslocamento x tempo', 'BHP/ECD x tempo', 'Free fall/tubo em U',
      'Índice operacional por fase', 'Resumo de volumes/fases'],
    points,
    annularProfile: { points: envelope, windowTopMD: plug.pTop, bottomMD: plug.pBase },
    summary: {
      referenceMD: plug.pBase, referenceTVD,
      topPerfMD: plug.pTop, basePerfMD: plug.pBase, topPerfTVD: tvdOf(plug.pTop), basePerfTVD: referenceTVD,
      porePsi, fracturePsi, bhpMaxPsi, bhpMinPsi,
      ecdMaxPpg: ecds.length ? Math.max(...ecds) : null,
      maxSurfacePressurePsi: 0,
      marginToFracturePsi: fracturePsi - bhpMaxPsi, marginAbovePorePsi: bhpMinPsi - porePsi,
      totalTimeMin: points.at(-1)?.timeMin ?? 0, pauseTimeMin,
      freeFallAccumBbl: accum, freeFallHeightM: tubingCap > 0 ? accum / tubingCap : 0,
      operationalIndex: Math.max(0, Math.round(100 - pressurePenalty - densityPenalty - ratePenalty - freeFallPenalty)),
      alert: bhpMaxPsi > fracturePsi ? 'above-fracture' : bhpMinPsi < porePsi ? 'below-pore' : 'inside-window',
      hhpMaxRequired, hhpAvailable, hhpUsePct: hhpAvailable && hhpAvailable > 0 ? hhpMaxRequired / hhpAvailable * 100 : null,
      equipmentAlerts,
    },
  };
}
