import { BBL_M } from '../models/constantes';
import type { PrimaryDiagnostic, PrimaryFluid, PrimaryFrictionLevel } from '../models/primary-cementing.model';
import type { PrimaryGeometrySegment } from '../models/primary-geometry.model';
import type { OperationVolumeSeries } from './operation-charts';
import { primaryPipeFriction } from './primary-friction';
import { K, PRIMARY_FRICTION_LEVEL_MULTIPLIER } from './primary-hydraulics';
import type { WellboreLayer, WorkStringPullResult } from './work-string-pull';
import type { WallSection } from './work-string-config';

export type { WallSection };

/**
 * Compressão do squeeze (SPEC squeeze-tampao §6.6–§6.7; R3 §14-9.4 a §14-9.6). Parte do
 * estado com a coluna acima dos canhoneados e o retorno fechado. O que é bombeado desce
 * pela coluna, sai na extremidade, desce pelo revestimento e sai do poço pelo canhoneado
 * de base. O anular coluna × revestimento fica parado:
 *
 * - **Bradenhead**: fechado na superfície (BOP) e ligado à extremidade; todo o
 *   revestimento fica sob a pressão.
 * - **Ferramenta** (packer recuperável ou retentor perfurável, na extremidade): isolado
 *   na ferramenta, com a contrapressão aplicada na superfície; o diferencial na
 *   ferramenta é a pressão abaixo menos a de cima.
 *
 * A saída fica no canhoneado de base para que todo o intervalo canhoneado seja
 * percurso: o que está nele sai primeiro, e a pasta que desce passa a cobri-lo. O
 * descobrimento é conferido no canhoneado de topo: quando o topo da pasta passa dele,
 * os canhoneados de cima ficam em contato com o fluido de trás.
 *
 * Com o retorno fechado não há queda livre nem tubo em U: a vazão de bombeio é a vazão
 * de injeção, e o movimento é determinado pelo volume. Por isso a compressão é um
 * estágio próprio, e não passo do transporte, como a retirada (§6.5).
 *
 * Condição de contorno (§6.7): cada bloco informa a pressão na superfície (na bomba,
 * no topo da coluna) e a vazão. O motor não sabe quanto a formação aceita; ele calcula a
 * pressão em cada profundidade pelo percurso e a maior pressão de superfície que mantém
 * os canhoneados abaixo da fratura (squeeze de baixa pressão).
 *
 * Não modela: desidratação, reboco e nodes (R3 Eqs. 14-2 a 14-11); o volume injetado
 * sai como fluido inteiro no canhoneado de base.
 */
export type CompressionBlock =
  | { kind: 'inject'; volumeBbl: number; rateBpm: number; surfacePressurePsi: number; fluidId?: string }
  | { kind: 'pressurize'; durationMin: number; surfacePressurePsi: number };

/** Estado no início da compressão: coluna, anular acima da extremidade e poço abaixo dela. */
export type CompressionStart = Pick<WorkStringPullResult, 'toMD' | 'fromMD' | 'internal' | 'annulus' | 'wellbore' | 'voidBbl'>;
export type CompressionIsolation =
  | { kind: 'bradenhead' }
  | { kind: 'tool'; tool: 'packer' | 'retainer';
      /** Pressão aplicada no anular acima da ferramenta, na superfície (padrão 0). */
      annulusPressurePsi?: number;
      /** Diferencial máximo da ferramenta; sem ele, não há comparação. */
      differentialLimitPsi?: number | null };

export interface SqueezeCompressionInput {
  /** Segmentos do motor: a coluna de 0 à extremidade (ID e capacidade). */
  segments: PrimaryGeometrySegment[];
  /** Parede do poço de 0 ao fundo do trecho (`start.fromMD`). */
  wall: WallSection[];
  start: CompressionStart;
  isolation: CompressionIsolation;
  fluids: PrimaryFluid[];
  /** Fluido bombeado quando o bloco não diz qual. */
  defaultFluidId: string;
  perforations: { topMD: number; baseMD: number };
  /** Profundidade da referência "canhoneados" do gráfico; padrão, o meio do intervalo. */
  referenceMD?: number;
  blocks: CompressionBlock[];
  friction: { internal: PrimaryFrictionLevel; annular: PrimaryFrictionLevel };
  fracGradPpg: number;
  poreGradPpg: number;
  /** Fratura (ppg) numa MD, pelo perfil por TVD do cenário; sem ela, `fracGradPpg`. */
  fracturePpgAt?: (md: number) => number;
  /** Limite de pressão interna do revestimento; sem ele, não há comparação (§11). */
  casingBurstPsi?: number | null;
  tvdOf: (md: number) => number;
  startTimeMin: number;
  startPumpedBbl: number;
}

export interface CompressionReference { id: 'perforations' | 'open-end'; md: number; tvd: number;
  pressurePsi: number; hydrostaticPsi: number; ecdPpg: number | null }

export interface CompressionPoint {
  timeMin: number;
  blockIndex: number;
  kind: CompressionBlock['kind'] | 'fill';
  /** Acumulado bombeado desde o início do job. */
  pumpedVolumeBbl: number;
  /** Acumulado que saiu pelos canhoneados. */
  injectedVolumeBbl: number;
  rateBpm: number;
  surfacePressurePsi: number;
  /** Pressão na cabeça do revestimento (anular fechado). */
  casingHeadPressurePsi: number;
  stringFrictionPsi: number;
  casingFrictionPsi: number;
  references: CompressionReference[];
  /** Maior pressão de superfície que mantém os canhoneados abaixo da fratura. */
  maxLowPressureSurfacePsi: number;
  /** Onde está o ponto mais crítico do canhoneado nesse instante, e a pressão do poço lá. */
  criticalMD: number;
  criticalPressurePsi: number;
  /** Pressão abaixo menos pressão acima da ferramenta; null na Bradenhead. */
  toolDifferentialPsi: number | null;
}

export interface CompressionBlockSummary {
  index: number;
  kind: CompressionBlock['kind'];
  startMin: number;
  endMin: number;
  pumpedBbl: number;
  injectedBbl: number;
  surfacePressurePsi: number;
  maxPerforationPressurePsi: number;
  maxLowPressureSurfacePsi: number;
  highPressure: boolean;
  maxToolDifferentialPsi: number | null;
}

export interface SqueezeCompressionResult {
  points: CompressionPoint[];
  blocks: CompressionBlockSummary[];
  injectedByFluid: Record<string, number>;
  pumpedByFluid: Record<string, number>;
  /** Estado no fim: coluna (de cima para baixo), revestimento abaixo da extremidade e anular. */
  internal: WellboreLayer[];
  wellbore: WellboreLayer[];
  annulus: WellboreLayer[];
  voidBbl: number;
  /** Maior pressão interna em cada profundidade do revestimento durante a compressão. */
  casingEnvelope: { md: number; tvd: number; maxPressurePsi: number }[];
  diagnostics: PrimaryDiagnostic[];
  totalTimeMin: number;
}

interface Piece { fluidId: string; volumeBbl: number }
interface Section { topMD: number; bottomMD: number; capBblM: number; diameterIn: number; zone: 'string' | 'casing' }
const EPS = 1e-9;
const SAMPLE_BBL = 0.05;
const MAX_SAMPLES = 200;

export function resolveSqueezeCompression(input: SqueezeCompressionInput): SqueezeCompressionResult {
  const { start: pull, segments, isolation } = input;
  // Posições calculadas por volume podem sair 1e-10 m fora do trecho; o levantamento
  // direcional recusa profundidade fora das estações.
  const tvdOf = (md: number) => input.tvdOf(Math.min(Math.max(md, 0), pull.fromMD));
  const tool = isolation.kind === 'tool' ? isolation : null;
  const toMD = pull.toMD;
  const fromMD = pull.fromMD;
  const perfTop = Math.min(input.perforations.topMD, input.perforations.baseMD);
  const perfBase = Math.max(input.perforations.topMD, input.perforations.baseMD);
  const referenceMD = input.referenceMD ?? (perfTop + perfBase) / 2;
  const fluid = new Map(input.fluids.map(entry => [entry.id, entry]));
  const density = (id: string) => fluid.get(id)?.densityPpg ?? 0;
  const cementIds = new Set(input.fluids.filter(entry => entry.kind === 'cement').map(entry => entry.id));
  const diagnostics: PrimaryDiagnostic[] = [];

  // Percurso: coluna de 0 à extremidade, revestimento da extremidade ao canhoneado de base.
  const cut = (top: number, bottom: number, zone: Section['zone']): Section[] => zone === 'string'
    ? segments.filter(s => s.bottomMD > top + EPS && s.topMD < bottom - EPS)
      .map(s => ({ topMD: Math.max(s.topMD, top), bottomMD: Math.min(s.bottomMD, bottom), zone,
        diameterIn: s.casingIDIn, capBblM: s.pipeCapacityBblM }))
    : input.wall.filter(w => w.bottomMD > top + EPS && w.topMD < bottom - EPS)
      .map(w => ({ topMD: Math.max(w.topMD, top), bottomMD: Math.min(w.bottomMD, bottom), zone,
        diameterIn: w.diameterIn, capBblM: BBL_M * w.diameterIn ** 2 }));
  const pathSections = [...cut(0, toMD, 'string'), ...cut(toMD, perfBase, 'casing')];
  if (!(perfTop > toMD + EPS) || perfBase > fromMD + EPS) {
    diagnostics.push({ code: 'PRIMARY_SQUEEZE_PERFORATIONS', severity: 'error', category: 'configuration',
      md: perfTop, message: `Os canhoneados (${perfTop}–${perfBase} m) precisam ficar abaixo da extremidade depois da retirada (${toMD.toFixed(1)} m) e acima da base do tampão (${fromMD} m).` });
    return { points: [], blocks: [], injectedByFluid: {}, pumpedByFluid: {}, internal: pull.internal,
      wellbore: pull.wellbore, annulus: pull.annulus, voidBbl: pull.voidBbl, casingEnvelope: [], diagnostics,
      totalTimeMin: input.startTimeMin };
  }

  // Estado inicial: líquido da coluna, revestimento até o canhoneado de base e o que fica parado abaixo.
  const splitAt = (layers: WellboreLayer[], md: number) => {
    const above: Piece[] = []; const below: WellboreLayer[] = [];
    for (const layer of layers) {
      if (layer.bottomMD <= md + EPS) { above.push({ fluidId: layer.fluidId, volumeBbl: layer.volumeBbl }); continue; }
      if (layer.topMD >= md - EPS) { below.push({ ...layer }); continue; }
      const share = volume(cut(layer.topMD, md, 'casing'), layer.topMD, md) / Math.max(EPS,
        volume(cut(layer.topMD, layer.bottomMD, 'casing'), layer.topMD, layer.bottomMD));
      above.push({ fluidId: layer.fluidId, volumeBbl: layer.volumeBbl * share });
      below.push({ fluidId: layer.fluidId, topMD: md, bottomMD: layer.bottomMD, volumeBbl: layer.volumeBbl * (1 - share) });
    }
    return { above, below };
  };
  const wellboreSplit = splitAt(pull.wellbore, perfBase);
  /** Do topo da coluna para o canhoneado de base. */
  let path: Piece[] = [...pull.internal.map(l => ({ fluidId: l.fluidId, volumeBbl: l.volumeBbl })), ...wellboreSplit.above]
    .filter(p => p.volumeBbl > EPS);
  let voidBbl = Math.max(0, pull.voidBbl);
  const staticBelow = wellboreSplit.below;
  const annulus = pull.annulus.map(l => ({ ...l }));

  // No retentor a pasta está na coluna de propósito: ela desce pelo retentor na compressão.
  const inCement = tool?.tool !== 'retainer' && ([...pull.internal, ...pull.annulus]
    .some(l => cementIds.has(l.fluidId) && l.volumeBbl > 1e-6)
    || pull.wellbore.some(l => cementIds.has(l.fluidId) && l.topMD < toMD + 1e-6 && l.volumeBbl > 1e-6));
  if (inCement)
    diagnostics.push({ code: 'PRIMARY_SQUEEZE_STRING_IN_CEMENT', severity: 'warning', category: 'placement', md: toMD,
      message: `Há pasta na altura da extremidade da coluna (${toMD.toFixed(1)} m) ou acima dela: ${tool ? 'o packer' : 'na Bradenhead, a coluna'} deve ficar acima do topo do cimento antes de ${tool ? 'ser fixado' : 'fechar o poço'}.` });

  // ── Posições e pressões ──
  /** Empilha o percurso a partir do canhoneado de base para cima; o vazio fica no topo. */
  const layout = (pieces: Piece[]) => {
    const placed: { fluidId: string; topMD: number; bottomMD: number; section: Section }[] = [];
    let s = pathSections.length - 1;
    let cursor = perfBase;
    for (let i = pieces.length - 1; i >= 0; i--) {
      let remaining = pieces[i].volumeBbl;
      while (remaining > EPS && s >= 0) {
        const section = pathSections[s];
        const bottom = Math.min(cursor, section.bottomMD);
        const room = (bottom - section.topMD) * section.capBblM;
        const used = Math.min(room, remaining);
        const top = bottom - used / section.capBblM;
        placed.push({ fluidId: pieces[i].fluidId, topMD: top, bottomMD: bottom, section });
        remaining -= used; cursor = top;
        if (top <= section.topMD + EPS) { s--; cursor = section.topMD; }
      }
    }
    return placed.reverse();
  };
  const hydro = (id: string, top: number, bottom: number) => K * density(id) * (tvdOf(bottom) - tvdOf(top));
  const frictionOf = (id: string, section: Section, lengthM: number, rate: number): number => {
    if (!(rate > 0) || !(lengthM > 0)) return 0;
    const entry = fluid.get(id);
    if (!entry) return 0;
    const drop = primaryPipeFriction({ flowRateBpm: rate, densityPpg: entry.densityPpg, n: entry.rheology.n,
      kLbfSnFt2: entry.rheology.kLbfSnFt2, lengthM }, section.diameterIn).pressureDropPsi ?? 0;
    return drop * PRIMARY_FRICTION_LEVEL_MULTIPLIER[section.zone === 'string' ? input.friction.internal : input.friction.annular];
  };

  /** Pressões num instante: pela coluna até a extremidade, pelo revestimento até o canhoneado e parado abaixo. */
  const state = (surfacePsi: number, rate: number) => {
    const placed = layout(path);
    const liquidTop = placed[0]?.topMD ?? perfBase;
    // Com vazio no topo da coluna, a superfície do líquido fica à pressão do vazio (zero, ventilada).
    let p = voidBbl > EPS ? 0 : surfacePsi;
    let stringFriction = 0; let casingFriction = 0;
    const pressureAtMD: { md: number; psi: number }[] = [{ md: liquidTop, psi: p }];
    for (const piece of placed) {
      const f = frictionOf(piece.fluidId, piece.section, piece.bottomMD - piece.topMD, rate);
      if (piece.section.zone === 'string') stringFriction += f; else casingFriction += f;
      p += hydro(piece.fluidId, piece.topMD, piece.bottomMD) - f;
      pressureAtMD.push({ md: piece.bottomMD, psi: p });
    }
    const atMD = (md: number): number => {
      if (md >= perfBase) {
        let q = p;
        for (const layer of staticBelow) {
          if (layer.topMD >= md) break;
          q += hydro(layer.fluidId, layer.topMD, Math.min(layer.bottomMD, md));
        }
        return q;
      }
      // Interpolação dentro do trecho (hidrostática e atrito lineares no trecho de um fluido).
      for (let i = 1; i < pressureAtMD.length; i++) {
        const a = pressureAtMD[i - 1]; const b = pressureAtMD[i];
        if (md <= b.md + EPS) {
          const piece = placed[i - 1];
          if (!piece || b.md - a.md <= EPS) return b.psi;
          const f = frictionOf(piece.fluidId, piece.section, md - a.md, rate);
          return a.psi + hydro(piece.fluidId, a.md, md) - f;
        }
      }
      return p;
    };
    const endPsi = atMD(toMD);
    const annulusColumn = (top: number, bottom: number) => annulus.reduce((sum, layer) => {
      const a = Math.max(layer.topMD, top); const b = Math.min(layer.bottomMD, bottom);
      return b > a ? sum + hydro(layer.fluidId, a, b) : sum;
    }, 0);
    // Bradenhead: anular parado e ligado à extremidade; a pressão cai de baixo para cima.
    // Ferramenta: anular isolado, com a contrapressão na superfície somada à hidrostática.
    const annulusAt = (md: number): number => tool
      ? (tool.annulusPressurePsi ?? 0) + annulusColumn(0, md)
      : endPsi - annulusColumn(md, toMD);
    /** Lado do poço (o que o revestimento vê): anular acima da extremidade, poço cheio abaixo. */
    const wellAt = (md: number) => md <= toMD ? annulusAt(md) : atMD(md);
    return { atMD, wellAt, placed, casingHead: annulusAt(0), stringFriction, casingFriction,
      surface: voidBbl > EPS ? 0 : surfacePsi, toolDifferential: tool ? endPsi - annulusAt(toMD) : null };
  };

  // Limite de baixa pressão: a pressão de superfície que leva o ponto mais crítico do canhoneado à fratura.
  const checkDepths = (snapshot: ReturnType<typeof state>) => [perfTop, perfBase,
    ...snapshot.placed.map(piece => piece.topMD).filter(md => md > perfTop && md < perfBase)];
  const fracturePsiAt = (md: number) => K * (input.fracturePpgAt?.(md) ?? input.fracGradPpg) * tvdOf(md);
  const lowPressureCheck = (surfacePsi: number, snapshot: ReturnType<typeof state>) => {
    let critical = { md: perfTop, margin: Infinity };
    for (const md of checkDepths(snapshot)) {
      const margin = fracturePsiAt(md) - (snapshot.atMD(md) - snapshot.surface);
      if (margin < critical.margin) critical = { md, margin };
    }
    return { limit: critical.margin + (surfacePsi - snapshot.surface), md: critical.md, pressure: snapshot.atMD(critical.md) };
  };

  const referenceMDs: { id: CompressionReference['id']; md: number }[] = [
    { id: 'perforations', md: referenceMD }, { id: 'open-end', md: toMD }];
  const referencesOf = (snapshot: ReturnType<typeof state>): CompressionReference[] => referenceMDs.map(ref => {
    const tvd = tvdOf(ref.md);
    // Pelo percurso: na extremidade, a pressão de saída da coluna (abaixo da ferramenta).
    const pressurePsi = snapshot.atMD(ref.md);
    const hydrostaticPsi = hydrostaticAt(ref.md);
    return { id: ref.id, md: ref.md, tvd, pressurePsi, hydrostaticPsi, ecdPpg: tvd > 0 ? pressurePsi / (K * tvd) : null };
  });
  /**
   * Só a coluna de fluidos acima do ponto, pelo percurso (coluna, revestimento e o que
   * está parado abaixo), sem pressão aplicada nem atrito: pressão − hidrostática é a
   * pressão de superfície menos o atrito.
   */
  const hydrostaticAt = (md: number): number => {
    let sum = 0;
    for (const piece of layout(path)) {
      const bottom = Math.min(piece.bottomMD, md);
      if (bottom > piece.topMD) sum += hydro(piece.fluidId, piece.topMD, bottom);
    }
    for (const layer of staticBelow) {
      const bottom = Math.min(layer.bottomMD, md);
      if (bottom > layer.topMD) sum += hydro(layer.fluidId, layer.topMD, bottom);
    }
    return sum;
  };

  /** Fluido na altura de um ponto do percurso. */
  const fluidAt = (md: number): string | null =>
    layout(path).find(piece => piece.topMD <= md + EPS && piece.bottomMD >= md - EPS)?.fluidId ?? null;
  const coveredAtStart = cementIds.has(fluidAt(perfTop) ?? '');
  let uncoveredAtBbl: number | null = null;
  let cementStarted = false;
  const aheadByFluid: Record<string, number> = {};
  const behindByFluid: Record<string, number> = {};

  // Envelope do revestimento exposto: amostras ao longo do poço e nas interfaces.
  const envelopeMDs = [...new Set([0, toMD, perfTop, perfBase, fromMD,
    ...Array.from({ length: 81 }, (_, i) => fromMD * i / 80)])].filter(md => md >= 0 && md <= fromMD).sort((a, b) => a - b);
  const envelope = new Map<number, number>(envelopeMDs.map(md => [md, -Infinity]));

  const points: CompressionPoint[] = [];
  const blocks: CompressionBlockSummary[] = [];
  const injectedByFluid: Record<string, number> = {};
  const pumpedByFluid: Record<string, number> = {};
  let time = input.startTimeMin;
  let pumped = input.startPumpedBbl;
  let injected = 0;

  const record = (blockIndex: number, kind: CompressionPoint['kind'], rate: number, surfacePsi: number) => {
    const snapshot = state(surfacePsi, rate);
    for (const md of envelopeMDs) envelope.set(md, Math.max(envelope.get(md)!, snapshot.wellAt(md)));
    const low = lowPressureCheck(surfacePsi, snapshot);
    const point: CompressionPoint = { timeMin: time, blockIndex, kind, pumpedVolumeBbl: pumped, injectedVolumeBbl: injected,
      rateBpm: rate, surfacePressurePsi: snapshot.surface, casingHeadPressurePsi: snapshot.casingHead,
      stringFrictionPsi: snapshot.stringFriction, casingFrictionPsi: snapshot.casingFriction,
      references: referencesOf(snapshot), maxLowPressureSurfacePsi: low.limit, criticalMD: low.md,
      criticalPressurePsi: low.pressure, toolDifferentialPsi: snapshot.toolDifferential };
    points.push(point);
    return point;
  };
  /** Bombeia `volume` do fluido: primeiro enche o vazio da coluna; depois empurra e injeta no canhoneado. */
  const pump = (fluidId: string, volume: number) => {
    pumpedByFluid[fluidId] = (pumpedByFluid[fluidId] ?? 0) + volume;
    let remaining = volume;
    const fill = Math.min(remaining, voidBbl);
    if (fill > 0) { voidBbl -= fill; remaining -= fill; }
    if (path[0]?.fluidId === fluidId) path[0] = { fluidId, volumeBbl: path[0].volumeBbl + volume };
    else path = [{ fluidId, volumeBbl: volume }, ...path];
    // Sai pelo canhoneado de topo o que chega lá, na mesma quantidade que entrou depois do vazio.
    let out = remaining;
    while (out > EPS && path.length) {
      const last = path[path.length - 1];
      const take = Math.min(out, last.volumeBbl);
      injectedByFluid[last.fluidId] = (injectedByFluid[last.fluidId] ?? 0) + take;
      if (cementIds.has(last.fluidId)) cementStarted = true;
      else {
        const bucket = cementStarted ? behindByFluid : aheadByFluid;
        bucket[last.fluidId] = (bucket[last.fluidId] ?? 0) + take;
      }
      injected += take; out -= take;
      if (last.volumeBbl - take <= EPS) path.pop(); else path[path.length - 1] = { ...last, volumeBbl: last.volumeBbl - take };
    }
  };

  input.blocks.forEach((block, index) => {
    const start = time;
    const pumpedAtStart = pumped; const injectedAtStart = injected;
    const blockPoints: CompressionPoint[] = [];
    if (block.kind === 'pressurize') {
      const duration = Math.max(0, block.durationMin);
      blockPoints.push(record(index, 'pressurize', 0, block.surfacePressurePsi));
      time += duration;
      blockPoints.push(record(index, 'pressurize', 0, block.surfacePressurePsi));
    } else {
      const rate = block.rateBpm > 0 ? block.rateBpm : 0;
      const total = Math.max(0, block.volumeBbl);
      const fluidId = block.fluidId ?? input.defaultFluidId;
      // Enchendo o vazio da coluna, o líquido abaixo dele não se move: sem vazão no percurso, sem atrito.
      blockPoints.push(voidBbl > EPS ? record(index, 'fill', 0, block.surfacePressurePsi)
        : record(index, 'inject', rate, block.surfacePressurePsi));
      const steps = Math.min(MAX_SAMPLES, Math.max(4, Math.ceil(total / SAMPLE_BBL)));
      for (let i = 0; i < steps && rate > 0; i++) {
        const dv = total / steps;
        const filling = voidBbl > EPS;
        pump(fluidId, dv);
        pumped += dv; time += dv / rate;
        if (coveredAtStart && uncoveredAtBbl === null && !cementIds.has(fluidAt(perfTop) ?? '')) uncoveredAtBbl = injected;
        blockPoints.push(filling && voidBbl > EPS ? record(index, 'fill', 0, block.surfacePressurePsi)
          : record(index, 'inject', rate, block.surfacePressurePsi));
      }
      if (!(rate > 0) && total > 0)
        diagnostics.push({ code: 'PRIMARY_SQUEEZE_RATE', severity: 'error', category: 'configuration',
          message: `Bloco ${index + 1}: injeção de ${total} bbl sem vazão.` });
    }
    const perfPressures = blockPoints.map(p => p.references.find(r => r.id === 'perforations')!.pressurePsi);
    const limit = Math.min(...blockPoints.map(p => p.maxLowPressureSurfacePsi));
    const differentials = blockPoints.map(p => p.toolDifferentialPsi).filter((v): v is number => v !== null);
    const summary: CompressionBlockSummary = { index, kind: block.kind, startMin: start, endMin: time,
      pumpedBbl: pumped - pumpedAtStart, injectedBbl: injected - injectedAtStart,
      surfacePressurePsi: block.surfacePressurePsi, maxPerforationPressurePsi: Math.max(...perfPressures),
      maxLowPressureSurfacePsi: limit, highPressure: block.surfacePressurePsi > limit + 1e-9,
      maxToolDifferentialPsi: differentials.length ? Math.max(...differentials) : null };
    blocks.push(summary);
    if (summary.highPressure)
      diagnostics.push({ code: 'PRIMARY_SQUEEZE_HIGH_PRESSURE', severity: 'warning', category: 'operational-limit',
        timeMin: start, endTimeMin: time, value: block.surfacePressurePsi, limit,
        message: `Bloco ${index + 1}: ${block.surfacePressurePsi.toFixed(0)} psi na superfície passa de ${limit.toFixed(0)} psi, a pressão que leva o canhoneado à fratura. É squeeze de alta pressão (R3 §14-9.2): a formação pode fraturar e aceitar a pasta inteira.` });
  });

  const describe = (bucket: Record<string, number>) => Object.entries(bucket).filter(([, volume]) => volume > 1e-6)
    .map(([id, volume]) => `${volume.toFixed(2)} bbl de ${fluid.get(id)?.name ?? id}`).join(' e ');
  const total = (bucket: Record<string, number>) => Object.values(bucket).reduce((sum, volume) => sum + volume, 0);
  if (total(aheadByFluid) > 1e-6)
    diagnostics.push({ code: 'PRIMARY_SQUEEZE_FLUID_AHEAD', severity: 'info', category: 'placement', md: perfBase,
      value: total(aheadByFluid),
      message: `Antes da pasta entraram na formação ${describe(aheadByFluid)}: o que estava no percurso entre a pasta e o canhoneado de base.` });
  if (uncoveredAtBbl !== null)
    diagnostics.push({ code: 'PRIMARY_SQUEEZE_PERFS_UNCOVERED', severity: 'warning', category: 'placement', md: perfTop,
      value: uncoveredAtBbl,
      message: `Com ${(uncoveredAtBbl as number).toFixed(2)} bbl injetados, o topo da pasta passou do canhoneado de topo (${perfTop} m): os canhoneados de cima ficam em contato com o fluido de trás.` });
  if (total(behindByFluid) > 1e-6)
    diagnostics.push({ code: 'PRIMARY_SQUEEZE_OVERDISPLACED', severity: 'warning', category: 'placement', md: perfBase,
      value: total(behindByFluid),
      message: `Depois da pasta entraram na formação ${describe(behindByFluid)}: a pasta acima do canhoneado de base acabou antes do fim da injeção.` });

  const limitPsi = tool?.differentialLimitPsi;
  const worstDifferential = Math.max(...points.map(p => p.toolDifferentialPsi ?? -Infinity));
  if (tool && limitPsi && limitPsi > 0 && worstDifferential > limitPsi)
    diagnostics.push({ code: 'PRIMARY_SQUEEZE_TOOL_DIFFERENTIAL', severity: 'warning', category: 'operational-limit',
      md: toMD, value: worstDifferential, limit: limitPsi,
      message: `O diferencial no ${tool.tool === 'packer' ? 'packer' : 'retentor'} chega a ${worstDifferential.toFixed(0)} psi, acima do limite informado de ${limitPsi.toFixed(0)} psi. Aumentar a contrapressão no anular reduz o diferencial.` });

  const casingEnvelope = envelopeMDs.map(md => ({ md, tvd: tvdOf(md), maxPressurePsi: envelope.get(md)! }))
    .filter(point => Number.isFinite(point.maxPressurePsi));
  const burst = input.casingBurstPsi;
  if (burst && burst > 0) {
    const worst = casingEnvelope.reduce((a, b) => b.maxPressurePsi > a.maxPressurePsi ? b : a, casingEnvelope[0]);
    if (worst && worst.maxPressurePsi > burst)
      diagnostics.push({ code: 'PRIMARY_SQUEEZE_CASING_BURST', severity: 'warning', category: 'operational-limit',
        md: worst.md, value: worst.maxPressurePsi, limit: burst,
        message: `O revestimento exposto chega a ${worst.maxPressurePsi.toFixed(0)} psi a ${worst.md.toFixed(0)} m, acima do limite informado de ${burst.toFixed(0)} psi (sem contrapressão externa).` });
  }

  // Estado final em camadas, para o esquemático e a conferência de volume.
  const placed = layout(path);
  const toLayer = (piece: typeof placed[number]): WellboreLayer => ({ fluidId: piece.fluidId, topMD: piece.topMD,
    bottomMD: piece.bottomMD, volumeBbl: (piece.bottomMD - piece.topMD) * piece.section.capBblM });
  return {
    points, blocks, injectedByFluid, pumpedByFluid,
    internal: merge(placed.filter(p => p.section.zone === 'string').map(toLayer)),
    wellbore: merge([...placed.filter(p => p.section.zone === 'casing').map(toLayer), ...staticBelow]),
    annulus, voidBbl, casingEnvelope, diagnostics, totalTimeMin: time,
  };
}

/** Série extra do gráfico de volume × tempo do squeeze (§5.1): o acumulado que entrou na formação. */
export function injectedVolumeSeries(result: SqueezeCompressionResult, startTimeMin: number): OperationVolumeSeries {
  return { id: 'injected', label: 'Injetado na formação', color: '#b91c1c', kind: 'extra',
    points: [{ timeMin: startTimeMin, volumeBbl: 0 }, ...result.points.map(p => ({ timeMin: p.timeMin, volumeBbl: p.injectedVolumeBbl }))] };
}

function volume(sections: { topMD: number; bottomMD: number; capBblM: number }[], top: number, bottom: number): number {
  return sections.reduce((sum, s) => {
    const a = Math.max(s.topMD, top); const b = Math.min(s.bottomMD, bottom);
    return b > a ? sum + (b - a) * s.capBblM : sum;
  }, 0);
}

function merge(layers: WellboreLayer[]): WellboreLayer[] {
  const out: WellboreLayer[] = [];
  for (const layer of layers) {
    const last = out.at(-1);
    if (last && last.fluidId === layer.fluidId && Math.abs(last.bottomMD - layer.topMD) < 1e-6) {
      last.bottomMD = layer.bottomMD; last.volumeBbl += layer.volumeBbl;
    } else out.push({ ...layer });
  }
  return out;
}
