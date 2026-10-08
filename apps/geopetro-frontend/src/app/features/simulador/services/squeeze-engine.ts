import type { PrimaryDiagnostic, PrimaryReference } from '../models/primary-cementing.model';
import type { AnnularPressureDepthPoint, Perfuracao, SqueezeGeometry, SqueezeHydraulicPoint,
  SqueezeHydraulicSimulation } from '../models/squeeze.model';
import type { WellGeometry } from '../models/well-geometry.model';
import { OPERATION_FLUID_COLORS, summarizeHydroEcd, type OperationChartPhase, type OperationCharts, type OperationHydroEcdPoint, type OperationHydroEcdReference, type OperationVolumeSeries, envelopeWithStaticState, type OperationHydroEcdMarker, type OperationFractureRisk, type OperationFractureRiskPoint, fractureStartOf } from './operation-charts';
import { K } from './primary-hydraulics';
import { gradientsAt, profileWindowRows } from './pressure-profile';
import { buildPrimaryOperationCharts, primarySimplifiedRheologyWarning } from './primary-operation-charts';
import type { PrimaryProgramResolution, PrimaryProgramService } from './primary-program.service';
import { retiradaTubos } from './retirada-tubos';
import { runRetainerSqueeze, type RetainerSqueezeResult } from './squeeze-retainer';
import { runTampaoEngine, volumeSeriesFromTransport, workStringFluids, TAMPAO_STEP_LABELS, type TampaoEngineInput,
  type TampaoEngineOverrides, type TampaoEngineResult, type TampaoPlacement } from './tampao-engine';
import { WellGeometryService } from './well-geometry.service';
import { injectedVolumeSeries, resolveSqueezeCompression, type CompressionBlock, type CompressionPoint,
  type SqueezeCompressionResult } from './work-string-compression';
import { wellWallSections, WORK_STRING_ASSEMBLY_ID } from './work-string-config';

/**
 * Squeeze no motor da primária (SPEC squeeze-tampao §6.6–§6.7, S7). O dimensionamento
 * de hoje (`SqueezeCalculoService.calcVolumes`) continua dono dos volumes; a técnica
 * escolhe a sequência:
 *
 * - **Bradenhead** e **packer**: posiciona como o tampão, com a pasta inteira bombeada (o
 *   tampão, de onde sai o volume injetado) equilibrada; drena até o equilíbrio, retira
 *   a coluna até a extremidade do relatório de retirada e comprime com o retorno fechado
 *   na BOP (Bradenhead) ou no packer.
 * - **Retentor**: `runRetainerSqueeze`, com o stinger desencaixado até a pasta chegar à
 *   ferramenta.
 *
 * Os blocos de compressão dizem o que entra na formação. No retentor, o motor acrescenta
 * antes deles o que está entre a pasta e os canhoneados (o vazio da queda livre e o
 * fluido abaixo do retentor), para que a pasta dos blocos seja a que entra na formação.
 */
export type SqueezeTechnique = 'bradenhead' | 'packer' | 'retainer';
export const SQUEEZE_TECHNIQUE_LABELS: Record<SqueezeTechnique, string> = {
  bradenhead: 'Bradenhead (sem ferramenta)', packer: 'Packer recuperável', retainer: 'Retentor perfurável',
};
export const SQUEEZE_REFERENCE_PERFORATIONS = 'perforations';
export const SQUEEZE_REFERENCE_OPEN_END = 'open-end';
/** Topo e base do intervalo canhoneado: onde o gráfico de fratura procura o ponto mais crítico. */
export const SQUEEZE_REFERENCE_PERF_TOP = 'perforation-top';
export const SQUEEZE_REFERENCE_PERF_BASE = 'perforation-base';

export interface SqueezeEngineInput extends Omit<TampaoEngineInput, 'plug' | 'pressureWindow' | 'extraReferences'> {
  technique: SqueezeTechnique;
  geom: SqueezeGeometry;
  perforations: Perfuracao[];
  /** Referência "canhoneados" do gráfico e do relatório (padrão de hoje: o meio do intervalo). */
  referenceMD: number;
  blocks: CompressionBlock[];
  retainer?: { md: number; bottomMD: number };
  annulusPressurePsi?: number;
  toolDifferentialLimitPsi?: number | null;
  casingBurstPsi?: number | null;
}

export interface SqueezeEngineSummary {
  technique: SqueezeTechnique;
  /** Extremidade na compressão: coluna depois da retirada, packer ou retentor. */
  toolMD: number | null;
  /** Topo da pasta em poço cheio antes da compressão (a regra da retirada usa este). */
  cementTopBeforeSqueezeMD: number | null;
  cementTopAfterSqueezeMD: number | null;
  injectedSlurryBbl: number;
  fluidAheadBbl: number;
  maxCasingHeadPsi: number | null;
  maxCasingPressure: { md: number; psi: number } | null;
  maxToolDifferentialPsi: number | null;
  lowPressureLimitPsi: number | null;
  highPressure: boolean;
  totalTimeMin: number;
}

export interface SqueezeEngineResult {
  input: SqueezeEngineInput;
  /** Posicionamento: o do tampão (Bradenhead, packer) ou o do retentor. */
  positioning: PrimaryProgramResolution;
  tampao: TampaoEngineResult | null;
  retainer: RetainerSqueezeResult | null;
  compression: SqueezeCompressionResult | null;
  /** Deslocamento do posicionamento: a pasta inteira equilibrada (Bradenhead, packer) ou o do retentor. */
  displacementBbl: number;
  summary: SqueezeEngineSummary;
  diagnostics: PrimaryDiagnostic[];
}

const wellGeo = new WellGeometryService();

/**
 * Deslocamento que equilibra a pasta inteira bombeada com a coluna imersa, com a água
 * atrás apoiada sobre ela (R3 §14-9.5: tampão balanceado nos canhoneados).
 */
export function balancedSqueezeDisplacement(geometry: WellGeometry, geom: SqueezeGeometry): {
  displacementBbl: number; topWithStringMD: number; topWithoutStringMD: number } {
  const withString = wellGeo.capacityResolver({ kind: 'annulusPlusPipe', pipeOD: geom.tOD, pipeID: geom.tID });
  const pipe = wellGeo.capacityResolver({ kind: 'pipe', pipeID: geom.tID });
  const hole = wellGeo.capacityResolver({ kind: 'open' });
  const topWithStringMD = wellGeo.calculateTopFromVolume(geometry, geom.base, geom.slurryTotal, withString).topMD;
  const topBack = Math.max(0, topWithStringMD - geom.backPhysicalHeight);
  return { topWithStringMD, displacementBbl: wellGeo.calculateVolumeBetween(geometry, 0, topBack, pipe),
    topWithoutStringMD: wellGeo.calculateTopFromVolume(geometry, geom.base, geom.slurryTotal, hole).topMD };
}

const perfRange = (perfs: Perfuracao[]) => ({ topMD: Math.min(...perfs.map(p => Math.min(p.top, p.base))),
  baseMD: Math.max(...perfs.map(p => Math.max(p.top, p.base))) });
const injectTotal = (blocks: CompressionBlock[]) =>
  blocks.reduce((sum, b) => sum + (b.kind === 'inject' ? Math.max(0, b.volumeBbl) : 0), 0);

export function runSqueezeEngine(service: PrimaryProgramService, input: SqueezeEngineInput,
  tvdOf: (md: number) => number, o: TampaoEngineOverrides = {}): SqueezeEngineResult {
  const f = o.rateFactor ?? 1;
  const blocks = input.blocks.map(b => b.kind === 'inject' ? { ...b, rateBpm: b.rateBpm * f } : { ...b });
  const perfs = perfRange(input.perforations);
  const densities = o.density != null ? { ...input.densities, slurry: o.density } : input.densities;
  const rates = { front: input.rates.front * f, slurry: input.rates.slurry * f, back: input.rates.back * f,
    displacement: input.rates.displacement * f };
  const diagnostics: PrimaryDiagnostic[] = [];

  if (input.technique === 'retainer' && input.retainer) {
    const userInject = injectTotal(blocks);
    const firstInject = blocks.find((b): b is Extract<CompressionBlock, { kind: 'inject' }> => b.kind === 'inject');
    const retainer = runRetainerSqueeze(service, {
      ...input, densities, rates, retainerMD: input.retainer.md, bottomMD: input.retainer.bottomMD,
      perforations: perfs, referenceMD: input.referenceMD,
      volumes: { injectBbl: userInject, frontBbl: input.geom.frontPhysicalVolumeBbl, backBbl: input.geom.backPhysicalVolumeBbl },
      blocks: plan => {
        const prelude = Math.max(0, plan.squeezeDisplacementBbl - userInject);
        return [...(prelude > 1e-9 ? [{ kind: 'inject' as const, volumeBbl: prelude,
          rateBpm: firstInject?.rateBpm ?? rates.displacement, surfacePressurePsi: firstInject?.surfacePressurePsi ?? 0 }] : []),
          ...blocks];
      },
      annulusPressurePsi: input.annulusPressurePsi, differentialLimitPsi: input.toolDifferentialLimitPsi,
      casingBurstPsi: input.casingBurstPsi,
    }, tvdOf);
    return finish(input, retainer.resolution, null, retainer, retainer.compression, retainer.spotDisplacementBbl,
      input.retainer.md, null, [...diagnostics, ...retainer.diagnostics]);
  }
  if (input.technique === 'retainer')
    diagnostics.push({ code: 'PRIMARY_RETAINER_DEPTH', severity: 'error', category: 'configuration',
      message: 'Informe a profundidade do retentor e o fundo do trecho isolado.' });

  const balanced = balancedSqueezeDisplacement(input.geometry, input.geom);
  const placement: TampaoPlacement = { pTop: input.geom.top, pBase: input.geom.base,
    frontPhysicalVolumeBbl: input.geom.frontPhysicalVolumeBbl, volCementTotal: input.geom.slurryTotal,
    backPhysicalVolumeBbl: input.geom.backPhysicalVolumeBbl, volDisplacement: balanced.displacementBbl,
    topCementWithoutTubing: balanced.topWithoutStringMD, capPipe: input.geom.tubingID_m };
  const toolMD = retiradaTubos({ baseDepthMD: placement.pBase, cementTopMD: placement.topCementWithoutTubing,
    ...input.retirada }).openEndDepthM;
  // Janela só nos canhoneados (formação exposta), com o perfil por TVD no topo e na base de cada um.
  const window = input.perforations.flatMap(p => {
    const range = { topMD: Math.min(p.top, p.base), bottomMD: Math.max(p.top, p.base) };
    const rows = input.pressureProfile ? profileWindowRows(input.pressureProfile, range, tvdOf, true) : [];
    const at = gradientsAt(input, tvdOf(range.topMD));
    return rows.length ? rows : [{ ...range, topPorePpg: at.porePpg, porePpg: at.porePpg, topFracturePpg: at.fracturePpg,
      fracturePpg: at.fracturePpg, exposed: true }];
  });
  const references: PrimaryReference[] = [
    { id: SQUEEZE_REFERENCE_PERFORATIONS, name: 'Canhoneados', md: input.referenceMD, zone: 'casing-annulus', assemblyId: WORK_STRING_ASSEMBLY_ID },
    { id: SQUEEZE_REFERENCE_OPEN_END, name: 'Extremidade da coluna', md: toolMD, zone: 'casing-annulus', assemblyId: WORK_STRING_ASSEMBLY_ID },
    { id: SQUEEZE_REFERENCE_PERF_TOP, name: 'Topo do canhoneado', md: perfs.topMD, zone: 'casing-annulus', assemblyId: WORK_STRING_ASSEMBLY_ID },
    { id: SQUEEZE_REFERENCE_PERF_BASE, name: 'Base do canhoneado', md: perfs.baseMD, zone: 'casing-annulus', assemblyId: WORK_STRING_ASSEMBLY_ID }];
  const tampao = runTampaoEngine(service, { ...input, densities, rates, plug: placement,
    pressureWindow: window, extraReferences: references }, tvdOf, { ...o, rateFactor: 1, density: undefined });
  const compression = tampao.pull ? resolveSqueezeCompression({
    segments: tampao.resolution.geometry.fullGeometry.segments, wall: wellWallSections(input.geometry, placement.pBase),
    start: tampao.pull, isolation: input.technique === 'packer'
      ? { kind: 'tool', tool: 'packer', annulusPressurePsi: input.annulusPressurePsi, differentialLimitPsi: input.toolDifferentialLimitPsi }
      : { kind: 'bradenhead' },
    fluids: tampao.primary.fluids, defaultFluidId: 'displacement', perforations: perfs, referenceMD: input.referenceMD,
    blocks, friction: { ...input.friction },
    fracGradPpg: input.fracGradPpg, poreGradPpg: input.poreGradPpg, casingBurstPsi: input.casingBurstPsi, tvdOf,
    fracturePpgAt: md => gradientsAt(input, tvdOf(md)).fracturePpg,
    startTimeMin: tampao.summary.totalTimeMin, startPumpedBbl: tampao.resolution.transport?.totalPumpedBbl ?? 0,
  }) : null;
  return finish(input, tampao.resolution, tampao, null, compression, balanced.displacementBbl, tampao.pull?.toMD ?? toolMD,
    tampao.pull?.wellboreTopOf('slurry') ?? null, [...diagnostics, ...(compression?.diagnostics ?? [])]);
}

function finish(input: SqueezeEngineInput, positioning: PrimaryProgramResolution, tampao: TampaoEngineResult | null,
  retainer: RetainerSqueezeResult | null, compression: SqueezeCompressionResult | null, displacementBbl: number,
  toolMD: number | null, cementTopBeforeSqueezeMD: number | null, diagnostics: PrimaryDiagnostic[]): SqueezeEngineResult {
  const cementIds = new Set(workStringFluids(input, input.densities.slurry).filter(fl => fl.kind === 'cement').map(fl => fl.id));
  const injected = compression?.injectedByFluid ?? {};
  const slurryTops = (compression?.wellbore ?? []).filter(l => cementIds.has(l.fluidId)).map(l => l.topMD);
  const points = compression?.points ?? [];
  const heads = points.map(p => p.casingHeadPressurePsi);
  const diffs = points.map(p => p.toolDifferentialPsi).filter((v): v is number => v !== null);
  const worst = (compression?.casingEnvelope ?? []).reduce<{ md: number; psi: number } | null>((acc, p) =>
    !acc || p.maxPressurePsi > acc.psi ? { md: p.md, psi: p.maxPressurePsi } : acc, null);
  const limits = (compression?.blocks ?? []).map(b => b.maxLowPressureSurfacePsi).filter(Number.isFinite);
  const fluidAhead = diagnostics.find(d => d.code === 'PRIMARY_SQUEEZE_FLUID_AHEAD')?.value ?? 0;
  return {
    input, positioning, tampao, retainer, compression, displacementBbl,
    summary: {
      technique: input.technique, toolMD,
      cementTopBeforeSqueezeMD,
      cementTopAfterSqueezeMD: slurryTops.length ? Math.min(...slurryTops) : null,
      injectedSlurryBbl: Object.entries(injected).filter(([id]) => cementIds.has(id)).reduce((s, [, v]) => s + v, 0),
      fluidAheadBbl: fluidAhead,
      maxCasingHeadPsi: heads.length ? Math.max(...heads) : null,
      maxCasingPressure: worst,
      maxToolDifferentialPsi: diffs.length ? Math.max(...diffs) : null,
      lowPressureLimitPsi: limits.length ? Math.min(...limits) : null,
      highPressure: (compression?.blocks ?? []).some(b => b.highPressure),
      totalTimeMin: compression?.totalTimeMin ?? positioning.transport?.totalTimeMin ?? 0,
    },
    diagnostics,
  };
}

// ── Gráficos ──────────────────────────────────────────────────────────────

const referenceLabels: Record<string, { label: string; title: string }> = {
  [SQUEEZE_REFERENCE_PERFORATIONS]: { label: 'Canhoneados', title: 'ECD e pressão hidrostática nos canhoneados' },
  [SQUEEZE_REFERENCE_OPEN_END]: { label: 'Extremidade da coluna', title: 'ECD e pressão hidrostática na extremidade da coluna' },
};

/** Os três gráficos da primária para o squeeze, com o seletor entre canhoneados e extremidade. */
export function buildSqueezeOperationCharts(result: SqueezeEngineResult, phases: OperationChartPhase[],
  operationPhaseId: string | null, tvdOf: (md: number) => number): OperationCharts | null {
  const hydraulics = result.positioning.hydraulics;
  if (!hydraulics) return null;
  const fluids = workStringFluids(result.input, result.input.densities.slurry);
  const base = buildPrimaryOperationCharts(hydraulics, result.positioning.volumes, fluids, phases, operationPhaseId, tvdOf);
  const compression = result.compression;
  const toolMD = result.summary.toolMD ?? result.input.geom.base;
  const refs = [{ id: SQUEEZE_REFERENCE_PERFORATIONS, md: result.input.referenceMD },
    { id: SQUEEZE_REFERENCE_OPEN_END, md: toolMD }];
  const referenceFrom = (id: string, md: number): OperationHydroEcdReference => {
    const tvd = tvdOf(md);
    // O ΔECD é só o atrito: a pressão aplicada na superfície da compressão fica à parte.
    const point = (volumeBbl: number, timeMin: number, pressurePsi: number | null, hydrostaticPsi: number | null,
      rate: number, circulating: boolean, applied = 0): OperationHydroEcdPoint => {
      const ecd = pressurePsi !== null && tvd > 0 ? pressurePsi / (K * tvd) : null;
      const esd = hydrostaticPsi !== null && tvd > 0 ? hydrostaticPsi / (K * tvd) : null;
      const dynamic = pressurePsi !== null && hydrostaticPsi !== null ? pressurePsi - hydrostaticPsi - applied : null;
      return { volumeBbl, timeMin, hydrostaticPsi, hydrostaticPpg: esd, ecdPpg: ecd,
        deltaEcdPpg: dynamic !== null && tvd > 0 ? dynamic / (K * tvd) : null,
        dynamicPressurePsi: dynamic, appliedPressurePsi: applied,
        annularFrictionPsi: null, outletTVD: tvd, pumpRateBpm: rate, circulating, unavailable: pressurePsi === null };
    };
    const points: OperationHydroEcdPoint[] = [];
    // Posicionamento: a referência do motor. No retentor, a extremidade é a saída ativa, e
    // os canhoneados estão isolados abaixo dele, parados no fluido inicial.
    const isolated = isolatedPerforationPsi(result, tvdOf);
    for (const p of hydraulics.points) {
      const ref = p.references.find(r => r.id === id);
      const circulating = p.phase === 'pump' && p.pumpRateBpm > 0;
      if (ref) points.push(point(p.pumpedVolumeBbl, p.timeMin, ref.pressurePsi, ref.hydrostaticPsi, p.pumpRateBpm, circulating));
      else if (id === SQUEEZE_REFERENCE_OPEN_END)
        points.push(point(p.pumpedVolumeBbl, p.timeMin, p.bhpPsi, p.annularHydrostaticPsi, p.pumpRateBpm, circulating));
      else if (isolated !== null) points.push(point(p.pumpedVolumeBbl, p.timeMin, isolated, isolated, p.pumpRateBpm, false));
    }
    // Depois da retirada, parado: a coluna de fluidos pelo lado do poço, marcada como ponto.
    const pull = result.tampao?.pull;
    const last = points.at(-1);
    const marker: OperationHydroEcdMarker | null = pull && tvd > 0 ? { label: 'Depois da retirada',
      volumeBbl: last?.volumeBbl ?? 0, timeMin: last?.timeMin ?? 0, hydrostaticPsi: pull.hydrostaticPsiAt(md),
      ecdPpg: pull.hydrostaticPsiAt(md) / (K * tvd) } : null;
    const compressionPoints = compression?.points ?? [];
    for (const p of compressionPoints) {
      const ref = p.references.find(r => r.id === id);
      if (ref) points.push(point(p.pumpedVolumeBbl, p.timeMin, ref.pressurePsi, ref.hydrostaticPsi, p.rateBpm,
        p.kind === 'inject', Math.max(0, p.surfacePressurePsi)));
    }
    const applied = Math.max(0, ...compressionPoints.map(p => p.surfacePressurePsi));
    const bands = compressionPoints.length ? [{ label: `Compressão (até ${applied.toFixed(0)} psi aplicados)`,
      from: compressionPoints[0].timeMin, to: compressionPoints.at(-1)!.timeMin }] : [];
    const labels = referenceLabels[id];
    return { id, label: labels.label, title: labels.title,
      description: 'Pelo tempo, do posicionamento ao fim da compressão. Hidrostática em psi à esquerda e ECD em ppg à '
        + 'direita, amarradas pela TVD da referência. O ΔECD é só o atrito; na compressão, a ECD sobe pela pressão '
        + 'aplicada na superfície, mostrada à parte.',
      tvd, points, summary: summarizeHydroEcd(points, false), axis: 'time', marker, bands };
  };

  // Envelope: posicionamento e estado depois da retirada. A compressão é série própria, só
  // onde há formação exposta (os canhoneados), fora do ECD máximo do bombeio.
  const pull = result.tampao?.pull;
  const envelope = pull ? envelopeWithStaticState(base.envelope, md => pull.hydrostaticPsiAt(md))
    : base.envelope.map(point => ({ ...point }));
  const perfs = perfRange(result.input.perforations);
  const casing = compression?.casingEnvelope ?? [];
  const casingAt = (md: number): number | null => {
    for (let i = 1; i < casing.length; i++) {
      const a = casing[i - 1]; const b = casing[i];
      if (md >= a.md - 1e-9 && md <= b.md + 1e-9)
        return b.md > a.md ? a.maxPressurePsi + (b.maxPressurePsi - a.maxPressurePsi) * (md - a.md) / (b.md - a.md) : b.maxPressurePsi;
    }
    return null;
  };
  for (const point of envelope) {
    point.compressionEcdPpg = null;
    if (!(point.tvd > 0) || point.md < perfs.topMD - 1e-9 || point.md > perfs.baseMD + 1e-9) continue;
    const psi = casingAt(point.md);
    if (psi !== null) point.compressionEcdPpg = psi / (K * point.tvd);
  }

  const volumes = volumeSeriesFromTransport(result.positioning, fluids);
  const compressionFluid = (p: CompressionPoint) => {
    const block = result.input.blocks[p.blockIndex];
    return block && block.kind === 'inject' ? block.fluidId ?? 'displacement' : 'displacement';
  };
  if (compression) {
    const start = volumes.find(s => s.kind === 'total')?.points.at(-1)?.volumeBbl ?? 0;
    for (const series of volumes) {
      const last = series.points.at(-1)?.volumeBbl ?? 0;
      for (const p of compression.points) {
        const added = p.pumpedVolumeBbl - start;
        series.points.push({ timeMin: p.timeMin,
          volumeBbl: series.kind === 'total' ? p.pumpedVolumeBbl : series.id === compressionFluid(p) ? last + added : last });
      }
    }
  }
  const series: OperationVolumeSeries[] = [...volumes,
    ...(compression ? [injectedVolumeSeries(compression, compression.points[0]?.timeMin ?? 0)] : [])];
  const phase = phases.find(entry => entry.id === operationPhaseId);
  const slurry = fluids.find(fl => fl.id === 'slurry');
  return {
    ...base,
    operation: 'squeeze',
    references: refs.map(ref => referenceFrom(ref.id, ref.md)),
    envelope,
    envelopeMarker: phase ? { label: 'Topo da fase da operação', md: phase.topMD } : null,
    volumes: series.map(s => s.id === 'injected' ? { ...s, color: '#b91c1c' } : s.kind === 'fluid'
      ? { ...s, color: OPERATION_FLUID_COLORS[fluids.find(fl => fl.id === s.id)?.kind ?? 'mud'] } : s),
    rheologyWarning: primarySimplifiedRheologyWarning(slurry ? [slurry] : []),
    fractureRisk: squeezeFractureRisk(result, tvdOf),
  };
}

/**
 * Risco de fratura nos canhoneados, pelo tempo: a pressão no poço na referência contra a
 * janela poro–fratura. A formação fratura quando algum ponto do intervalo passa da pressão
 * de fratura; a borda de cima é a pressão na referência em que isso acontece, pela folga do
 * ponto mais crítico (topo, base ou a referência). Na compressão, a folga é a do motor: a
 * maior pressão de superfície sem fraturar menos a aplicada, a mesma dos avisos de alta pressão.
 */
export function squeezeFractureRisk(result: SqueezeEngineResult, tvdOf: (md: number) => number): OperationFractureRisk | null {
  const input = result.input;
  const md = input.referenceMD;
  const tvd = tvdOf(md);
  if (!(tvd > 0)) return null;
  const frac = (depth: number) => K * gradientsAt(input, tvdOf(depth)).fracturePpg * tvdOf(depth);
  const porePsi = K * gradientsAt(input, tvd).porePpg * tvd;
  const perfs = perfRange(input.perforations);
  const points: OperationFractureRiskPoint[] = [];
  /** Folga até a fratura no ponto mais crítico, com a pressão em cada profundidade. */
  const margin = (pressureAt: (depth: number) => number | null) => Math.min(...[md, perfs.topMD, perfs.baseMD]
    .map(depth => { const p = pressureAt(depth); return p === null ? Infinity : frac(depth) - p; }));
  const isolated = isolatedPerforationPsi(result, tvdOf);
  for (const p of result.positioning.hydraulics?.points ?? []) {
    const at = (depth: number, id: string) => p.references.find(r => r.id === id && Math.abs(r.md - depth) < 1e-6)?.pressurePsi ?? null;
    const pressure = at(md, SQUEEZE_REFERENCE_PERFORATIONS) ?? isolated;
    if (pressure === null) continue;
    // Retentor: abaixo dele, o fluido inicial parado desde a superfície.
    const pressureAt = (depth: number) => isolated !== null ? K * input.densities.completion * tvdOf(depth)
      : depth === md ? pressure : at(depth, depth === perfs.topMD ? SQUEEZE_REFERENCE_PERF_TOP : SQUEEZE_REFERENCE_PERF_BASE);
    points.push({ timeMin: p.timeMin, pressurePsi: pressure, porePsi, fracturePsi: pressure + margin(pressureAt),
      surfacePressurePsi: 0, maxSurfacePressurePsi: null });
  }
  const compression = result.compression;
  const pull = result.tampao?.pull;
  // Depois da retirada, parado, no começo da compressão (a retirada leva tempo).
  if (pull && compression?.points.length) {
    const pressure = pull.hydrostaticPsiAt(md);
    points.push({ timeMin: compression.points[0].timeMin, pressurePsi: pressure, porePsi,
      fracturePsi: pressure + margin(depth => pull.hydrostaticPsiAt(depth)), surfacePressurePsi: 0, maxSurfacePressurePsi: null });
  }
  for (const p of compression?.points ?? []) {
    const ref = p.references.find(r => r.id === SQUEEZE_REFERENCE_PERFORATIONS);
    if (!ref) continue;
    // Folga do ponto mais crítico no instante (fratura ali − pressão ali), levada à referência.
    const criticalMargin = frac(p.criticalMD) - p.criticalPressurePsi;
    points.push({ timeMin: p.timeMin, pressurePsi: ref.pressurePsi, porePsi,
      fracturePsi: ref.pressurePsi + criticalMargin,
      surfacePressurePsi: p.surfacePressurePsi, maxSurfacePressurePsi: p.maxLowPressureSurfacePsi });
  }
  if (!points.length) return null;
  const limits = (compression?.points ?? []).map(p => p.maxLowPressureSurfacePsi).filter(Number.isFinite);
  return { md, tvd, points,
    compression: compression?.points.length ? { from: compression.points[0].timeMin, to: compression.points.at(-1)!.timeMin } : null,
    fractureStart: fractureStartOf(points),
    surfaceLimitPsi: limits.length ? Math.min(...limits) : null,
    maxSurfacePressurePsi: Math.max(0, ...points.map(p => p.surfacePressurePsi)),
    belowPore: points.some(p => p.pressurePsi < p.porePsi - 1e-6) };
}

/** Retentor: abaixo dele, antes de encaixar, o fluido inicial parado desde a superfície. */
function isolatedPerforationPsi(result: SqueezeEngineResult, tvdOf: (md: number) => number): number | null {
  return result.retainer ? K * result.input.densities.completion * tvdOf(result.input.referenceMD) : null;
}

// ── Formato antigo (métricas da aba e relatório de conformidade) ───────────

/**
 * O resultado do motor no formato da simulação antiga, na referência "canhoneados". A
 * compressão entra com as fases "Injeção N" e "Pressurização N", que o relatório de
 * injetividade procura.
 */
export function squeezeLegacyHydraulics(result: SqueezeEngineResult, tvdOf: (md: number) => number): SqueezeHydraulicSimulation | null {
  const hydraulics = result.positioning.hydraulics;
  if (!hydraulics) return null;
  const input = result.input;
  const referenceMD = input.referenceMD;
  const referenceTVD = tvdOf(referenceMD);
  const perfs = perfRange(input.perforations);
  const window = gradientsAt(input, referenceTVD);
  const porePsi = K * window.porePpg * referenceTVD;
  const fracturePsi = K * window.fracturePpg * referenceTVD;
  const tubingCap = input.geom.tubingID_m;
  let accum = 0;
  let previous: { t: number; extra: number } | null = null;
  let phase = 'Início';
  const points: SqueezeHydraulicPoint[] = [];
  const isolated = isolatedPerforationPsi(result, tvdOf);
  for (const p of hydraulics.points) {
    const ref = p.references.find(r => r.id === SQUEEZE_REFERENCE_PERFORATIONS);
    const bhp = ref?.pressurePsi ?? isolated ?? p.bhpPsi;
    if (bhp === null) continue;
    if (p.stepId) phase = TAMPAO_STEP_LABELS[p.stepId] ?? p.stepId;
    const outlet = p.outletRateBpm ?? p.pumpRateBpm;
    const extra = Math.max(0, outlet - p.pumpRateBpm);
    if (previous) accum += (previous.extra + extra) / 2 * Math.max(0, p.timeMin - previous.t);
    previous = { t: p.timeMin, extra };
    points.push({ timeMin: p.timeMin, phase, pumpedVolumeBbl: p.pumpedVolumeBbl, injectedVolumeBbl: 0,
      programmedRateBpm: p.pumpRateBpm, realRateBpm: outlet, freeFallExtraRateBpm: extra,
      pumpPressurePsi: p.pumpPressurePsi ?? 0, surfacePressurePsi: 0, frictionPsi: p.pipeFrictionPsi ?? 0,
      annularFrictionPsi: p.annularFrictionPsi ?? 0, hydrostaticPsi: ref?.hydrostaticPsi ?? isolated ?? p.annularHydrostaticPsi ?? 0,
      bhpPsi: bhp, ecdPpg: referenceTVD > 0 ? bhp / (K * referenceTVD) : null, porePsi, fracturePsi,
      freeFallAccumBbl: accum, freeFallHeightM: tubingCap > 0 ? accum / tubingCap : 0,
      drivePsi: Math.max(0, p.uTubeDrivePsi ?? 0),
      hydraulicLossPsi: (p.pipeFrictionPsi ?? 0) + (p.annularFrictionPsi ?? 0) });
  }
  const counters = { inject: 0, pressurize: 0 };
  let blockSeen = -1;
  for (const p of result.compression?.points ?? []) {
    if (p.blockIndex !== blockSeen) {
      blockSeen = p.blockIndex;
      if (p.kind === 'pressurize') counters.pressurize++; else counters.inject++;
    }
    const ref = p.references.find(r => r.id === SQUEEZE_REFERENCE_PERFORATIONS)!;
    points.push({ timeMin: p.timeMin, phase: p.kind === 'pressurize' ? `Pressurização ${counters.pressurize}` : `Injeção ${counters.inject}`,
      pumpedVolumeBbl: p.pumpedVolumeBbl, injectedVolumeBbl: p.injectedVolumeBbl,
      programmedRateBpm: p.rateBpm, realRateBpm: p.rateBpm, freeFallExtraRateBpm: 0,
      pumpPressurePsi: p.surfacePressurePsi, surfacePressurePsi: p.surfacePressurePsi,
      frictionPsi: p.stringFrictionPsi + p.casingFrictionPsi, annularFrictionPsi: 0,
      hydrostaticPsi: ref.hydrostaticPsi, bhpPsi: ref.pressurePsi, ecdPpg: ref.ecdPpg, porePsi, fracturePsi,
      freeFallAccumBbl: accum, freeFallHeightM: tubingCap > 0 ? accum / tubingCap : 0, drivePsi: 0,
      hydraulicLossPsi: p.stringFrictionPsi + p.casingFrictionPsi });
  }
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
  const pauseTimeMin = result.positioning.volumes.stages.flatMap(s => s.steps)
    .filter(step => step.kind === 'pause' && step.stepId !== 'settle').reduce((sum, step) => sum + step.durationMin, 0)
    + (result.compression?.blocks ?? []).filter(b => b.kind === 'pressurize').reduce((s, b) => s + (b.endMin - b.startMin), 0);
  const envelope: AnnularPressureDepthPoint[] = hydraulics.envelope.map(e => ({ md: e.md, tvd: e.tvd,
    porePsi: e.porePsi, fracPsi: e.fracturePsi, maxAnnularPsi: e.maxAnnularPsi ?? 0, minAnnularPsi: e.minAnnularPsi ?? 0 }));
  return {
    categories: ['Pressão e deslocamento x tempo', 'BHP/ECD x tempo', 'Free fall/tubo em U',
      'Índice operacional por fase', 'Resumo de volumes/fases'],
    points,
    annularProfile: { points: envelope, windowTopMD: perfs.topMD, bottomMD: input.geom.base },
    summary: {
      referenceMD, referenceTVD, topPerfMD: perfs.topMD, basePerfMD: perfs.baseMD,
      topPerfTVD: tvdOf(perfs.topMD), basePerfTVD: tvdOf(perfs.baseMD), porePsi, fracturePsi, bhpMaxPsi, bhpMinPsi,
      ecdMaxPpg: ecds.length ? Math.max(...ecds) : null,
      maxSurfacePressurePsi: Math.max(0, ...(result.compression?.points ?? []).map(p => p.surfacePressurePsi)),
      marginToFracturePsi: fracturePsi - bhpMaxPsi, marginAbovePorePsi: bhpMinPsi - porePsi,
      totalTimeMin: points.at(-1)?.timeMin ?? 0, pauseTimeMin,
      freeFallAccumBbl: accum, freeFallHeightM: tubingCap > 0 ? accum / tubingCap : 0,
      operationalIndex: Math.max(0, Math.round(100 - pressurePenalty - densityPenalty - ratePenalty - Math.min(18, accum * 2))),
      alert: bhpMaxPsi > fracturePsi ? 'above-fracture' : bhpMinPsi < porePsi ? 'below-pore' : 'inside-window',
      hhpMaxRequired, hhpAvailable, hhpUsePct: hhpAvailable && hhpAvailable > 0 ? hhpMaxRequired / hhpAvailable * 100 : null,
      equipmentAlerts,
    },
  };
}

// ── Cenários antigos ──────────────────────────────────────────────────────

/**
 * Programa de compressão de um cenário salvo antes das técnicas (§8, T-20). A fase de
 * hoje é uma injeção só, sob a pressão de operação, ao longo do tempo de pressurização
 * (mínimo de 1 min); vira um bloco de injeção com a mesma duração e o mesmo volume. Sem
 * volume, vira um bloco de pressurização com o tempo informado.
 */
export function legacySqueezeBlocks(v: { volMaxInjetadoBbl?: unknown; pressaoOperacao?: unknown;
  tempoPressurizacaoMin?: unknown }): CompressionBlock[] {
  const volume = Math.max(0, Number(v.volMaxInjetadoBbl) || 0);
  const pressure = Math.max(0, Number(v.pressaoOperacao) || 0);
  const minutes = Math.max(1, Number(v.tempoPressurizacaoMin) || 0);
  return volume > 0
    ? [{ kind: 'inject', volumeBbl: volume, rateBpm: volume / minutes, surfacePressurePsi: pressure }]
    : [{ kind: 'pressurize', durationMin: minutes, surfacePressurePsi: pressure }];
}

/** Os campos que o relatório de injetividade lê (`volMaxInjetadoBbl`, `pressaoOperacao`, `tempoPressurizacaoMin`), pelos blocos. */
export function squeezeInjectionFields(blocks: CompressionBlock[]): { volMaxInjetadoBbl: number; pressaoOperacao: number;
  tempoPressurizacaoMin: number } {
  const injects = blocks.filter((b): b is Extract<CompressionBlock, { kind: 'inject' }> => b.kind === 'inject');
  return {
    volMaxInjetadoBbl: injectTotal(blocks),
    pressaoOperacao: Math.max(0, ...blocks.map(b => b.surfacePressurePsi)),
    tempoPressurizacaoMin: injects.reduce((s, b) => s + (b.rateBpm > 0 ? b.volumeBbl / b.rateBpm : 0), 0)
      + blocks.reduce((s, b) => s + (b.kind === 'pressurize' ? b.durationMin : 0), 0),
  };
}
