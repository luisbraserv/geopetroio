import { HYDRO_M } from '../models/constantes';
import type { PrimaryConfiguration, PrimaryDiagnostic, PrimaryFluid, PrimaryHydraulicPoint,
  PrimaryFrictionLevel, PrimaryPathZone, PrimaryReference, PrimarySnapshot } from '../models/primary-cementing.model';
import type { PrimaryGeometrySegment, PrimaryStageGeometryResolution } from '../models/primary-geometry.model';
import type { PrimaryCriticalSample, PrimaryCriticalStep, PrimaryFullSnapshot, PrimaryHydraulicsResult, PrimaryLimitBreach,
  PrimaryPressureBalance, PrimaryPressureBalanceInput } from '../models/primary-hydraulics.model';
import type { PrimaryRateDecision, PrimaryRateModel, PrimaryTransportResult,
  PrimaryTransportSnapshot } from '../models/primary-transport.model';
import { PRIMARY_FRICTION_CORRELATION, primaryAnnularFriction, primaryPipeFriction,
  type PrimaryFrictionResult } from './primary-friction';

/** `K = 0.052·3.28084`; a primária não cria outra constante de hidrostática. */
export const K = HYDRO_M;
const HHP_DIVISOR = 40.8;
const VOID_EPS = 1e-9;
/** Pressão atmosférica padrão, psi. */
export const PRIMARY_ATMOSPHERIC_PSI = 14.695949;

/**
 * Pressão manométrica no topo do líquido quando a coluna interna cai e abre
 * vazio (R3 §12-6: a pasta "puxa vácuo na parte superior do revestimento").
 * Cabeça fechada: vácuo pleno, sem pressão de vapor nem ar admitido. Superfície
 * livre ventilada: atmosférica. Em nenhum caso a pressão é inventada acima disso.
 */
export function primaryVoidPressurePsi(head: PrimaryConfiguration['headCondition']): number {
  return head === 'vented-free-surface' ? 0 : -PRIMARY_ATMOSPHERIC_PSI;
}

/**
 * Sensibilidade operacional para a condicao media das superficies molhadas.
 * A correlacao e a reologia do fluido calculam a perda-base; o nivel selecionado
 * corrige essa perda para tubo/parede em uso tipico ou em condicao severa.
 */
export const PRIMARY_FRICTION_LEVEL_MULTIPLIER: Record<PrimaryFrictionLevel, number> = {
  low: 1,
  medium: 1.15,
  high: 1.35,
};

/**
 * Balanço de pressão com colunas e perdas dados. Isolar assim permite conferir
 * o balanço sem depender de geometria, transporte ou correlação de atrito.
 */
export function primaryPressureBalance(input: PrimaryPressureBalanceInput): PrimaryPressureBalance {
  const { returnPressurePsi, internalHydrostaticPsi, annularHydrostaticPsi,
    pipeFrictionPsi, annularFrictionPsi, localLossPsi, outletTVD } = input;
  const bhpPsi = returnPressurePsi + annularHydrostaticPsi + annularFrictionPsi;
  return {
    requiredPumpPressurePsi: returnPressurePsi + annularHydrostaticPsi - internalHydrostaticPsi
      + pipeFrictionPsi + annularFrictionPsi + localLossPsi,
    bhpPsi,
    ecdPpg: outletTVD > 0 ? bhpPsi / (K * outletTVD) : null,
    uTubeDrivePsi: internalHydrostaticPsi - annularHydrostaticPsi - returnPressurePsi,
  };
}

/**
 * Vazão natural de queda livre: raiz positiva de `F_int+F_an+F_local = ΔP_motriz`.
 * Bissecção num intervalo que contenha a raiz; sem raiz devolve `null`, nunca um
 * múltiplo arbitrário da vazão de bomba.
 */
export function primaryNaturalRate(lossesAt: (rateBpm: number) => number | null,
  drivePsi: number, maxRateBpm = 200, tolerancePsi = 0.01): number | null {
  if (!Number.isFinite(drivePsi) || drivePsi <= 0) return null;
  const residual = (rate: number): number | null => {
    const losses = lossesAt(rate);
    return losses === null ? null : losses - drivePsi;
  };
  const high = residual(maxRateBpm);
  if (high === null || high < 0) return null;
  let low = 0;
  let upper = maxRateBpm;
  for (let i = 0; i < 200; i++) {
    const middle = (low + upper) / 2;
    const value = residual(middle);
    if (value === null) return null;
    if (Math.abs(value) <= tolerancePsi) return middle;
    if (value > 0) upper = middle; else low = middle;
  }
  return null;
}

interface Slice {
  segment: PrimaryGeometrySegment;
  fluid: PrimaryFluid;
  zone: PrimaryPathZone;
  topMD: number; bottomMD: number;
  topTVD: number; bottomTVD: number;
  hydrostaticPsi: number;
  frictionPsi: number | null;
  reynolds: number | null;
  laminarLimitRe: number | null;
  turbulentLimitRe: number | null;
}

interface ColumnEntry { slice: Slice; hydrostatic: number; friction: number }

/** Acumulado até `md`, interpolando dentro da fatia que o contém (fatias em ordem de MD). */
function columnAt(column: ColumnEntry[], md: number): { hydrostatic: number; friction: number } {
  if (!column.length || md <= column[0].slice.topMD) return { hydrostatic: 0, friction: 0 };
  const last = column[column.length - 1];
  if (md >= last.slice.bottomMD) return { hydrostatic: last.hydrostatic, friction: last.friction };
  // Primeira fatia cuja base alcança o MD, por busca binária.
  let low = 0;
  let high = column.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (md <= column[middle].slice.bottomMD) high = middle; else low = middle + 1;
  }
  const entry = column[low];
  if (md <= entry.slice.topMD) {
    // Entre duas fatias: vale o acumulado da anterior.
    const previous = column[low - 1];
    return previous ? { hydrostatic: previous.hydrostatic, friction: previous.friction } : { hydrostatic: 0, friction: 0 };
  }
  const fraction = (md - entry.slice.topMD) / (entry.slice.bottomMD - entry.slice.topMD);
  return { hydrostatic: entry.hydrostatic - entry.slice.hydrostaticPsi * (1 - fraction),
    friction: entry.friction - (entry.slice.frictionPsi ?? 0) * (1 - fraction) };
}

/** Geometria, fluidos e conversão de profundidade que o balanço e o modelo de vazão compartilham. */
function hydraulicContext(primary: PrimaryConfiguration, geometry: PrimaryStageGeometryResolution,
  tvdOf: (md: number) => number) {
  const shoeMD = primary.target!.shoeMD;
  const segments = geometry.fullGeometry.segments;
  const fluidById = new Map(primary.fluids.map(f => [f.id, f]));
  // Intervalos sao semiabertos no encontro entre duas fases. Assim, a
  // profundidade exata da sapata anterior pertence ao trecho que comeca ali,
  // e nao ao revestimento que termina no mesmo MD.
  const ordered = [...segments].sort((a, b) => a.topMD - b.topMD);
  const segmentAt = (md: number): PrimaryGeometrySegment | undefined => {
    // Busca binária: a hidráulica acoplada consulta isto a cada fatia de cada passo.
    let low = 0;
    let high = ordered.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const s = ordered[middle];
      if (md < s.topMD) high = middle - 1;
      else if (md < s.bottomMD || (md === shoeMD && md === s.bottomMD)) return s;
      else low = middle + 1;
    }
    return undefined;
  };
  const multiplier = (zone: PrimaryPathZone): number => PRIMARY_FRICTION_LEVEL_MULTIPLIER[zone === 'internal'
    ? primary.frictionSettings?.internal ?? 'medium'
    : primary.frictionSettings?.annular ?? 'medium'];
  const friction = (zone: PrimaryPathZone, fluid: PrimaryFluid, segment: PrimaryGeometrySegment,
    rateBpm: number, lengthM: number): PrimaryFrictionResult => {
    const input = { flowRateBpm: rateBpm, densityPpg: fluid.densityPpg,
      n: fluid.rheology.n, kLbfSnFt2: fluid.rheology.kLbfSnFt2, lengthM };
    return zone === 'internal'
      ? primaryPipeFriction(input, segment.casingIDIn)
      : primaryAnnularFriction(input, segment.outerDiameterIn, segment.casingODIn);
  };

  /**
   * Seção hidráulica de um trecho: mesmo diâmetro interno no tubo, mesmos
   * diâmetro externo e OD no anular. Fatias da mesma seção e do mesmo fluido têm
   * a mesma perda por metro, então o atrito é calculado uma vez por grupo.
   */
  const sectionKeys = new Map<PrimaryGeometrySegment, { internal: string; annulus: string }>();
  const sectionKey = (zone: PrimaryPathZone, segment: PrimaryGeometrySegment): string => {
    let keys = sectionKeys.get(segment);
    if (!keys) {
      keys = { internal: `${segment.casingIDIn}`, annulus: `${segment.outerDiameterIn}|${segment.casingODIn}` };
      sectionKeys.set(segment, keys);
    }
    return zone === 'internal' ? keys.internal : keys.annulus;
  };

  /** Fatias de uma zona num intervalo; o vazio não tem parcela e não pesa. */
  const slices = (parcels: PrimarySnapshot['parcels'], zone: PrimaryPathZone,
    fromMD: number, toMD: number, rateBpm: number): Slice[] | null => {
    const out: Slice[] = [];
    const perMeter = new Map<PrimaryFluid, Map<string, PrimaryFrictionResult>>();
    // Fatias vizinhas compartilham a fronteira: a TVD da base serve de topo da próxima.
    let lastMD = Number.NaN;
    let lastTVD = Number.NaN;
    for (const parcel of parcels
      .filter(p => p.zone === zone && p.bottomMD > p.topMD && p.bottomMD > fromMD && p.topMD < toMD)
      .sort((a, b) => a.topMD - b.topMD)) {
      const topMD = Math.max(fromMD, parcel.topMD);
      const bottomMD = Math.min(toMD, parcel.bottomMD);
      if (bottomMD <= topMD) continue;
      const fluid = fluidById.get(parcel.fluidId);
      const segment = segmentAt((topMD + bottomMD) / 2);
      if (!fluid || !segment) return null;
      const topTVD = topMD === lastMD ? lastTVD : tvdOf(topMD);
      const bottomTVD = tvdOf(bottomMD);
      lastMD = bottomMD;
      lastTVD = bottomTVD;
      let byFluid = perMeter.get(fluid);
      if (!byFluid) { byFluid = new Map(); perMeter.set(fluid, byFluid); }
      const key = sectionKey(zone, segment);
      let unit = byFluid.get(key);
      if (!unit) { unit = friction(zone, fluid, segment, rateBpm, 1); byFluid.set(key, unit); }
      const length = bottomMD - topMD;
      out.push({ segment, fluid, zone, topMD, bottomMD, topTVD, bottomTVD,
        hydrostaticPsi: K * fluid.densityPpg * (bottomTVD - topTVD),
        frictionPsi: unit.pressureDropPsi === null ? null
          : unit.pressureDropPsi * length * multiplier(zone),
        reynolds: unit.reynolds, laminarLimitRe: unit.laminarLimitRe, turbulentLimitRe: unit.turbulentLimitRe });
    }
    return out;
  };

  /**
   * Hidrostáticas e grupos de atrito de um estado, sem montar fatias: a TVD só é
   * avaliada nas fronteiras entre fluidos, e o atrito agrupa comprimento por fluido
   * e seção. É o que o modelo de vazão consulta a cada passo do transporte.
   */
  const summary = (parcels: PrimarySnapshot['parcels'], outletMD: number) => {
    let hInt = 0;
    let hAn = 0;
    let internalLiquid = 0;
    let missing = false;
    type Group = { zone: PrimaryPathZone; fluid: PrimaryFluid; segment: PrimaryGeometrySegment; lengthM: number };
    const list: Group[] = [];
    const index = new Map<PrimaryFluid, Map<string, Group>>();
    for (const zone of ['internal', 'casing-annulus'] as const) {
      const runs = parcels.filter(p => p.zone === zone && p.bottomMD > p.topMD && p.topMD < outletMD && p.bottomMD > 0)
        .sort((a, b) => a.topMD - b.topMD);
      let runFluid: PrimaryFluid | null = null;
      let runTop = 0;
      let runBottom = 0;
      const closeRun = () => {
        if (!runFluid) return;
        const dh = K * runFluid.densityPpg * (tvdOf(runBottom) - tvdOf(runTop));
        if (zone === 'internal') hInt += dh; else hAn += dh;
      };
      for (const parcel of runs) {
        const topMD = Math.max(0, parcel.topMD);
        const bottomMD = Math.min(outletMD, parcel.bottomMD);
        if (bottomMD <= topMD) continue;
        const fluid = fluidById.get(parcel.fluidId);
        const segment = segmentAt((topMD + bottomMD) / 2);
        if (!fluid || !segment) { missing = true; continue; }
        if (zone === 'internal') internalLiquid += bottomMD - topMD;
        // Hidrostática por trecho contínuo de um mesmo fluido.
        if (runFluid === fluid && Math.abs(topMD - runBottom) <= 1e-9) runBottom = bottomMD;
        else { closeRun(); runFluid = fluid; runTop = topMD; runBottom = bottomMD; }
        let byFluid = index.get(fluid);
        if (!byFluid) { byFluid = new Map(); index.set(fluid, byFluid); }
        const key = `${zone === 'internal' ? 'i' : 'a'}|${sectionKey(zone, segment)}`;
        const group = byFluid.get(key);
        if (group) group.lengthM += bottomMD - topMD;
        else {
          const created: Group = { zone, fluid, segment, lengthM: bottomMD - topMD };
          byFluid.set(key, created);
          list.push(created);
        }
      }
      closeRun();
    }
    const losses = (rateBpm: number): number | null => {
      let total = 0;
      for (const group of list) {
        const dp = friction(group.zone, group.fluid, group.segment, rateBpm, group.lengthM).pressureDropPsi;
        if (dp === null) return null;
        total += dp * multiplier(group.zone);
      }
      return total;
    };
    return missing ? null : { hInt, hAn, internalLiquid, losses };
  };

  return { shoeMD, segments, fluidById, segmentAt, slices, summary };
}

/**
 * Raiz de `perdas(Q) = alvo` com as perdas crescentes em Q: parte da vazão da
 * bomba, dobra até cercar a raiz e fecha por regula falsi (Illinois). Evita
 * avaliar vazões absurdas, onde o escoamento seria turbulento sem necessidade.
 */
function solveOutletRate(losses: (rateBpm: number) => number | null, target: number,
  startBpm: number, maxRateBpm = 2000, tolerancePsi = 1e-4): number | null {
  let low = 0;
  let fLow = -target;
  let high = Math.max(startBpm, 0.5);
  let value = losses(high);
  if (value === null) return null;
  let fHigh = value - target;
  while (fHigh < 0) {
    low = high; fLow = fHigh;
    high *= 2;
    if (high > maxRateBpm) return null;
    value = losses(high);
    if (value === null) return null;
    fHigh = value - target;
  }
  let side = 0;
  for (let i = 0; i < 100; i++) {
    const rate = (low * fHigh - high * fLow) / (fHigh - fLow);
    value = losses(rate);
    if (value === null) return null;
    const f = value - target;
    if (Math.abs(f) <= tolerancePsi || high - low <= 1e-9 * Math.max(1, high)) return rate;
    if (f > 0) {
      high = rate; fHigh = f;
      if (side === -1) fLow /= 2;
      side = -1;
    } else {
      low = rate; fLow = f;
      if (side === 1) fHigh /= 2;
      side = 1;
    }
  }
  return null;
}

/**
 * Modelo de vazão da primária (§7.5): decide, para o estado de fluidos de um
 * instante, se o circuito fica cheio com a vazão da bomba ou se a coluna interna
 * cai livre. Na queda livre, a vazão de saída é a raiz de
 * `F_int(Q)+F_an(Q) = P_vazio + H_int − H_an − P_retorno`, com H_int medido do
 * topo do líquido para baixo; o colar impede fluxo reverso (Q ≥ 0).
 *
 * Plugues e dardos são separadores ideais sem volume: descem com o líquido e
 * não mudam o balanço. Hipótese quase estática — sem inércia, gás comprimido nem
 * dinâmica mecânica do plugue.
 */
export function createPrimaryRateModel(primary: PrimaryConfiguration,
  geometry: PrimaryStageGeometryResolution, tvdOf: (md: number) => number): PrimaryRateModel {
  const ctx = hydraulicContext(primary, geometry, tvdOf);
  const voidPressure = primaryVoidPressurePsi(primary.headCondition);
  const outside = (reason: string, message: string): PrimaryRateDecision => ({ regime: 'outside-model', reason, message });
  return state => {
    if (state.sealed) return { regime: 'landed', outletRateBpm: 0 };
    const column = ctx.summary(state.parcels, state.outletMD);
    if (!column)
      return outside('PRIMARY_HYDRAULICS_SLICE', 'Parcela sem fluido ou trecho de geometria correspondente.');
    const hasVoid = state.voidBbl > VOID_EPS;
    if (hasVoid && column.internalLiquid <= 1e-9)
      return outside('PRIMARY_VOID_AT_OUTLET', 'O vazio alcançou a saída ativa: entraria gás no anular, o que este modelo não representa.');
    const { hInt, hAn, losses } = column;
    const drive = voidPressure + hInt - hAn - primary.returnPressurePsi;
    if (!hasVoid) {
      const atPump = losses(state.pumpRateBpm);
      if (atPump === null)
        return outside('PRIMARY_FRICTION_UNAVAILABLE', 'Reologia ou geometria não permitem calcular o atrito.');
      const required = primary.returnPressurePsi + hAn - hInt + atPump;
      if (required >= voidPressure - 1e-9)
        return { regime: state.pumpRateBpm > 0 ? 'full' : 'static', outletRateBpm: state.pumpRateBpm };
    }
    // Com vazio e sem desbalanço a favor da saída, a coluna para: o colar não deixa voltar.
    if (drive <= 0) return { regime: 'free-fall', outletRateBpm: 0 };
    const rate = solveOutletRate(losses, drive, state.pumpRateBpm);
    if (rate === null)
      return outside('PRIMARY_FREE_FALL_UNRESOLVED', 'A vazão de queda livre não foi resolvida até 2000 bpm, ou o atrito ficou indisponível.');
    return { regime: 'free-fall', outletRateBpm: rate };
  };
}

/** Desbalanço a favor do anular acima do qual a coluna de trabalho retornaria fluido. */
const WORKSTRING_BACKFLOW_PSI = 0.5;

export function resolvePrimaryHydraulics(primary: PrimaryConfiguration,
  geometry: PrimaryStageGeometryResolution, transport: PrimaryTransportResult,
  tvdOf: (md: number) => number, references: PrimaryReference[] = []): PrimaryHydraulicsResult {
  const diagnostics: PrimaryDiagnostic[] = [];
  const points: PrimaryHydraulicPoint[] = [];
  const snapshots: PrimaryFullSnapshot[] = [];
  const seen = new Set<string>();
  const note = (code: string, message: string, extra: Partial<PrimaryDiagnostic> = {}): void => {
    const key = `${code}|${extra.stageId ?? ''}|${extra.stepId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push({ code, message, severity: 'warning', category: 'outside-model', ...extra });
  };
  if (!primary.target || transport.status === 'invalid' || !transport.snapshots.length)
    return { points: [], snapshots: [], envelope: [], breaches: [], narrowestFractureMargin: null,
      hydraulicPowerUsagePct: null, status: 'invalid',
      diagnostics: [{ code: 'PRIMARY_HYDRAULICS_INPUT', severity: 'error', category: 'configuration',
        message: 'A hidráulica exige um transporte válido.' }] };
  const ctx = hydraulicContext(primary, geometry, tvdOf);
  const { shoeMD, segments, fluidById, segmentAt } = ctx;
  const voidPressure = primaryVoidPressurePsi(primary.headCondition);
  const stageOfDevice = (deviceId: string): string | null =>
    primary.stages.find(s => s.deviceId === deviceId)?.id ?? null;
  // Sem coeficiente de perda local no contrato, F_local é zero e a omissão é
  // informada: não se inventa perda no colar nem na sapata.
  if (geometry.accessories.length)
    note('PRIMARY_LOCAL_LOSS_OMITTED', 'Acessórios sem coeficiente de perda local declarado; F_local usa zero.',
      { severity: 'info' });

  // Reologia estimada não é propriedade do fluido: o atrito, o ECD e a queda livre
  // dependem dela, então o resultado é parcial até n e k serem informados ou medidos.
  const circulating = new Set(transport.snapshots.flatMap(s => s.parcels.map(p => p.fluidId)));
  for (const fluid of primary.fluids.filter(f => circulating.has(f.id))) {
    const estimated = (['n', 'kLbfSnFt2'] as const)
      .some(field => (fluid.propertySources[field]?.source ?? 'estimated') === 'estimated');
    if (estimated)
      diagnostics.push({ code: 'PRIMARY_RHEOLOGY_ESTIMATED', severity: 'warning', category: 'configuration',
        message: `${fluid.name}: n e k são estimativa, não propriedade informada ou medida; atrito, ECD e queda livre dependem deles.` });
  }

  const windows = primary.pressureWindow.map(entry => ({ entry,
    topTVD: tvdOf(entry.topMD), bottomTVD: tvdOf(entry.bottomMD) }));
  const windowAt = (md: number, tvdAtMd?: number): { porePpg: number | null; fracturePpg: number | null } => {
    const openHole = segmentAt(md)?.outerBoundary === 'open-hole';
    const found = windows.find(w => md >= w.entry.topMD && md <= w.entry.bottomMD && (openHole || w.entry.exposed));
    if (!found) return { porePpg: null, fracturePpg: null };
    const { entry, topTVD, bottomTVD } = found;
    const ratio = bottomTVD > topTVD
      ? Math.max(0, Math.min(1, ((tvdAtMd ?? tvdOf(md)) - topTVD) / (bottomTVD - topTVD))) : 1;
    const interpolate = (top: number | null | undefined, bottom: number | null): number | null => {
      if (bottom === null) return null;
      const start = top ?? bottom;
      return start + (bottom - start) * ratio;
    };
    return {
      porePpg: interpolate(entry.topPorePpg, entry.porePpg),
      fracturePpg: interpolate(entry.topFracturePpg, entry.fracturePpg),
    };
  };

  const accumulate = (slices: Slice[]): ColumnEntry[] => {
    let hydrostatic = 0;
    let friction = 0;
    return slices.map(slice => {
      hydrostatic += slice.hydrostaticPsi;
      friction += slice.frictionPsi ?? 0;
      return { slice, hydrostatic, friction };
    });
  };

  const breaches = new Map<string, PrimaryLimitBreach>();
  const recordBreach = (limit: PrimaryLimitBreach['limit'], value: number, limitValue: number,
    snapshot: PrimaryTransportSnapshot, md?: number, tvd?: number): void => {
    const key = `${limit}|${snapshot.stageId}`;
    const current = breaches.get(key);
    if (!current) {
      breaches.set(key, { limit, startTimeMin: snapshot.timeMin, endTimeMin: snapshot.timeMin,
        peakValue: value, limitValue, stageId: snapshot.stageId, stepId: snapshot.stepId, md, tvd });
      return;
    }
    current.endTimeMin = snapshot.timeMin;
    if (Math.abs(value) > Math.abs(current.peakValue)) { current.peakValue = value; current.md = md; current.tvd = tvd; }
  };

  // Perfil suficientemente denso para mostrar a variacao real entre limites de geometria.
  // Os pontos de fronteira continuam explicitos; a malha intermediaria apenas interpola
  // as colunas que o motor ja resolveu.
  // Na coluna de trabalho (tampão, squeeze) a janela pode ser curta, como um canhoneado de
  // 10 m entre dois pontos da malha: os limites dela entram na malha, senão poro, fratura e
  // a verificação de limite somem ali. A primária não muda.
  const windowLimits = primary.target?.kind === 'work-string'
    ? primary.pressureWindow.flatMap(w => [w.topMD, w.bottomMD]).filter(md => md >= 0) : [];
  const envelopeGrid = [...new Set([
    ...segments.flatMap(s => [s.topMD, s.bottomMD]),
    ...Array.from({ length: 61 }, (_, index) => shoeMD * index / 60),
    ...windowLimits,
  ])].sort((a, b) => a - b).filter(md => md <= shoeMD);
  // TVD, poro e fratura da malha não mudam no tempo: calculados uma vez.
  const envelopeStatic = envelopeGrid.map(md => {
    const tvd = tvdOf(md);
    const limits = windowAt(md, tvd);
    return { md, tvd, porePsi: limits.porePpg !== null ? K * limits.porePpg * tvd : null,
      fracturePsi: limits.fracturePpg !== null ? K * limits.fracturePpg * tvd : null };
  });
  const envelopeState = new Map<number, {
    min: number; max: number; minHydrostatic: number; maxHydrostatic: number;
  }>();
  let narrowest: PrimaryHydraulicsResult['narrowestFractureMargin'] = null;
  // Janela operacional §3.3: menor margem até a fratura e sobre o poro em cada etapa.
  const criticalByStep = new Map<string, PrimaryCriticalStep>();
  let backflowReported = false;
  let peakHydraulicPower = 0;
  let outsideModel = false;

  for (const snapshot of transport.snapshots) {
    const outletMD = snapshot.activeOutletMD ?? shoeMD;
    const outletTVD = tvdOf(outletMD);
    // Com modelo de vazão, o transporte já decidiu o regime; sem ele (P5 isolado),
    // a hidráulica decide pelo balanço e para na tendência de queda livre.
    const regime = snapshot.flowRegime;
    const coupled = regime !== undefined;
    // Só o plugue do próprio estágio bloqueia; o do estágio anterior já cumpriu seu papel.
    const landed = coupled ? regime === 'landed'
      : snapshot.plugs.some(p => p.state === 'landed-closed' && stageOfDevice(p.deviceId) === snapshot.stageId);
    const freeFall = regime === 'free-fall';
    const flowRate = freeFall ? snapshot.outletRateBpm ?? 0
      : landed || snapshot.pumpRateBpm <= 0 ? 0 : snapshot.pumpRateBpm;
    const staticCircuit = flowRate <= 0 && !freeFall;
    const voidBbl = snapshot.voidBbl ?? 0;
    const pumped = snapshot.inventory.reduce((sum, i) => sum + i.pumpedBbl, 0);
    const returned = snapshot.inventory.reduce((sum, i) => sum + i.returnedBbl, 0);
    const cementOf = (pick: 'pumpedBbl' | 'returnedBbl') => snapshot.inventory
      .filter(i => fluidById.get(i.fluidId)?.kind === 'cement').reduce((sum, i) => sum + i[pick], 0);
    const base = {
      timeMin: snapshot.timeMin, stageId: snapshot.stageId, stepId: snapshot.stepId,
      phase: (landed ? 'plug-landed' : snapshot.pumpRateBpm > 0 ? 'pump' : 'static') as PrimaryHydraulicPoint['phase'],
      pumpedVolumeBbl: pumped, cementPumpedVolumeBbl: cementOf('pumpedBbl'),
      returnedVolumeBbl: returned, cementReturnedBbl: cementOf('returnedBbl'),
      activeOutletMD: outletMD, pumpRateBpm: snapshot.pumpRateBpm,
      referenceId: 'outlet', voidVolumeBbl: coupled ? voidBbl : null as number | null,
    };
    const unavailable = (state: PrimaryHydraulicPoint['state']): PrimaryHydraulicPoint => ({
      ...base, outletRateBpm: null, returnRateBpm: null, inletDensityPpg: null,
      requiredPumpPressurePsi: null, pumpPressurePsi: null, annularHydrostaticPsi: null,
      internalHydrostaticPsi: null, pipeFrictionPsi: null, annularFrictionPsi: null, localLossPsi: null,
      bhpPsi: null, ecdPpg: null, porePsi: null, fracturePsi: null, uTubeDrivePsi: null,
      state, references: [],
    });
    // Ao primeiro estado fora do modelo, as séries físicas terminam no último instante válido.
    const stop = (point: PrimaryHydraulicPoint): void => {
      points.push(point);
      snapshots.push({ ...snapshot, profiles: [] });
      outsideModel = true;
    };
    if (regime === 'outside-model') { stop(unavailable('outside-model')); break; }
    const internal = ctx.slices(snapshot.parcels, 'internal', 0, outletMD, flowRate);
    const annulus = ctx.slices(snapshot.parcels, 'casing-annulus', 0, outletMD, flowRate);
    // Abaixo da saída ativa o anular segue comunicante, porém parado: hidrostática
    // a partir da pressão na conexão, com atrito zero.
    const tail = ctx.slices(snapshot.parcels, 'casing-annulus', outletMD, shoeMD, 0);
    if (!internal || !annulus || !tail) {
      note('PRIMARY_HYDRAULICS_SLICE', 'Parcela sem fluido ou trecho de geometria correspondente; pressões indisponíveis.',
        { stageId: snapshot.stageId, stepId: snapshot.stepId ?? undefined, timeMin: snapshot.timeMin });
      stop(unavailable('outside-model'));
      break;
    }
    const internalColumn = accumulate(internal);
    const annularColumn = accumulate(annulus);
    const tailColumn = accumulate(tail);
    const internalHydrostaticPsi = internalColumn.at(-1)?.hydrostatic ?? 0;
    const annularHydrostaticPsi = annularColumn.at(-1)?.hydrostatic ?? 0;
    const frictionMissing = [...internal, ...annulus].some(s => s.frictionPsi === null);
    if (frictionMissing) {
      note('PRIMARY_FRICTION_UNAVAILABLE', 'Reologia ou geometria não permitem calcular o atrito; pressões indisponíveis.',
        { stageId: snapshot.stageId, stepId: snapshot.stepId ?? undefined, timeMin: snapshot.timeMin });
      stop({ ...unavailable('outside-model'), internalHydrostaticPsi, annularHydrostaticPsi });
      break;
    }
    const pipeFrictionPsi = internalColumn.at(-1)?.friction ?? 0;
    const annularFrictionPsi = annularColumn.at(-1)?.friction ?? 0;
    const localLossPsi = 0;
    const balance = primaryPressureBalance({ returnPressurePsi: primary.returnPressurePsi,
      internalHydrostaticPsi, annularHydrostaticPsi, pipeFrictionPsi, annularFrictionPsi,
      localLossPsi, outletTVD });

    // Sem modelo de vazão, pressão requerida negativa não é truncada em zero:
    // é queda livre não resolvida, e as curvas físicas param aqui.
    if (!coupled && !staticCircuit && balance.requiredPumpPressurePsi < voidPressure) {
      note('PRIMARY_FREE_FALL_UNRESOLVED',
        'Tendência de queda livre num transporte sem modelo de vazão: as curvas físicas param aqui, sem criar vazio nem truncar a pressão.',
        { stageId: snapshot.stageId, stepId: snapshot.stepId ?? undefined, timeMin: snapshot.timeMin,
          value: balance.requiredPumpPressurePsi });
      stop({ ...unavailable('outside-model'), internalHydrostaticPsi, annularHydrostaticPsi,
        uTubeDrivePsi: balance.uTubeDrivePsi });
      break;
    }

    // Pressão na cabeça: a requerida com o circuito cheio; o vácuo do topo do
    // líquido em queda livre; o vácuo também enquanto o bombeio enche o vazio
    // sobre um plugue já assentado. Em repouso, é condição informada: null.
    const headPressurePsi: number | null = freeFall ? voidPressure
      : landed ? (voidBbl > VOID_EPS ? voidPressure : null)
        : staticCircuit ? null : balance.requiredPumpPressurePsi;

    const annularPressureAt = (md: number): number => {
      if (md <= outletMD) {
        const column = columnAt(annularColumn, md);
        return primary.returnPressurePsi + column.hydrostatic + column.friction;
      }
      return primary.returnPressurePsi + annularHydrostaticPsi + annularFrictionPsi
        + columnAt(tailColumn, md).hydrostatic;
    };
    const annularHydrostaticAt = (md: number): number => {
      if (md <= outletMD)
        return columnAt(annularColumn, md).hydrostatic;
      return annularHydrostaticPsi + columnAt(tailColumn, md).hydrostatic;
    };
    // Acima do topo do líquido fica o vazio: pressão do vazio, sem coluna nem atrito.
    const internalPressureAt = (md: number): number | null => {
      if (headPressurePsi === null || landed) return null;
      const column = columnAt(internalColumn, md);
      return headPressurePsi + column.hydrostatic - column.friction;
    };

    const referenceRows = references.map(reference => {
      const tvd = tvdOf(reference.md);
      const pressurePsi = reference.zone === 'casing-annulus'
        ? annularPressureAt(reference.md) : internalPressureAt(reference.md);
      if (pressurePsi === null)
        note('PRIMARY_REFERENCE_UNAVAILABLE', `${reference.id}: sem condição de contorno para a pressão interna em repouso.`,
          { stageId: snapshot.stageId, timeMin: snapshot.timeMin, md: reference.md });
      const hydrostaticPsi = reference.zone === 'casing-annulus'
        ? annularHydrostaticAt(reference.md) : columnAt(internalColumn, reference.md).hydrostatic;
      return { id: reference.id, md: reference.md, tvd, pressurePsi,
        ecdPpg: pressurePsi !== null && tvd > 0 ? pressurePsi / (K * tvd) : null, hydrostaticPsi };
    });

    // Coluna de trabalho sem válvula de retenção: com a bomba parada e o anular mais
    // pesado, o fluido voltaria pela coluna. O motor herda a retenção do colar e não
    // simula esse retorno; avisa, com o desbalanço.
    if (primary.target.kind === 'work-string' && snapshot.pumpRateBpm <= 0 && !backflowReported) {
      const full = staticCircuit && voidBbl <= VOID_EPS;
      const reverse = full ? balance.requiredPumpPressurePsi
        : voidBbl > VOID_EPS && flowRate <= 0
          ? primary.returnPressurePsi + annularHydrostaticPsi - internalHydrostaticPsi - voidPressure : 0;
      if (reverse > WORKSTRING_BACKFLOW_PSI) {
        backflowReported = true;
        diagnostics.push({ code: 'PRIMARY_WORKSTRING_BACKFLOW', severity: 'warning', category: 'placement',
          stageId: snapshot.stageId, stepId: snapshot.stepId ?? undefined, timeMin: snapshot.timeMin,
          md: outletMD, value: reverse,
          message: full
            ? `O anular está ${reverse.toFixed(1)} psi mais pesado que a coluna na extremidade (sobredeslocamento): `
              + 'com a cabeça aberta o fluido voltaria pela coluna até a mesa. O motor não simula esse retorno; '
              + 'a coluna segura essa pressão enquanto a cabeça estiver fechada.'
            : `O anular está ${reverse.toFixed(1)} psi mais pesado que a coluna e há ${voidBbl.toFixed(2)} bbl de vazio no topo `
              + 'da coluna: o anular empurraria fluido de volta, enchendo o vazio. O motor não simula esse retorno, e as '
              + 'interfaces ficam onde a queda livre parou.' });
      }
    }

    const outletWindow = windowAt(outletMD);
    const profiles: PrimarySnapshot['profiles'] = [...internalColumn, ...annularColumn, ...tailColumn]
      .map(entry => {
        const md = entry.slice.bottomMD;
        const tvd = entry.slice.bottomTVD;
        const limits = windowAt(md, tvd);
        const pressurePsi = entry.slice.zone === 'casing-annulus' ? annularPressureAt(md) : internalPressureAt(md);
        return { segmentId: entry.slice.segment.id, zone: entry.slice.zone, fluidId: entry.slice.fluid.id,
          md, tvd, densityPpg: entry.slice.fluid.densityPpg, pressurePsi,
          ecdPpg: pressurePsi !== null && tvd > 0 ? pressurePsi / (K * tvd) : null,
          porePpg: limits.porePpg, fracturePpg: limits.fracturePpg, reynolds: entry.slice.reynolds,
          correlationId: PRIMARY_FRICTION_CORRELATION.id, correlationVersion: PRIMARY_FRICTION_CORRELATION.version,
          maxLaminarRe: entry.slice.laminarLimitRe, minTurbulentRe: entry.slice.turbulentLimitRe };
      });

    for (const { md, tvd, porePsi, fracturePsi } of envelopeStatic) {
      const pressure = annularPressureAt(md);
      const hydrostatic = annularHydrostaticAt(md);
      const current = envelopeState.get(md);
      if (current) {
        current.min = Math.min(current.min, pressure);
        current.max = Math.max(current.max, pressure);
        current.minHydrostatic = Math.min(current.minHydrostatic, hydrostatic);
        current.maxHydrostatic = Math.max(current.maxHydrostatic, hydrostatic);
      } else envelopeState.set(md, { min: pressure, max: pressure, minHydrostatic: hydrostatic, maxHydrostatic: hydrostatic });
      if (fracturePsi !== null) {
        const margin = fracturePsi - pressure;
        if (!narrowest || margin < narrowest.psi) narrowest = { psi: margin, md, tvd, timeMin: snapshot.timeMin };
        if (margin < 0) recordBreach('fracture', pressure, fracturePsi, snapshot, md, tvd);
      }
      if (porePsi !== null && pressure < porePsi) recordBreach('pore', pressure, porePsi, snapshot, md, tvd);
      if (fracturePsi !== null || porePsi !== null) {
        const key = `${snapshot.stageId}|${snapshot.stepId ?? ''}`;
        let step = criticalByStep.get(key);
        if (!step) criticalByStep.set(key, step = { stageId: snapshot.stageId, stepId: snapshot.stepId, fracture: null, pore: null });
        const sample = (marginPsi: number): PrimaryCriticalSample =>
          ({ md, tvd, timeMin: snapshot.timeMin, pressurePsi: pressure, porePsi, fracturePsi, marginPsi });
        if (fracturePsi !== null && (!step.fracture || fracturePsi - pressure < step.fracture.marginPsi))
          step.fracture = sample(fracturePsi - pressure);
        if (porePsi !== null && (!step.pore || pressure - porePsi < step.pore.marginPsi)) step.pore = sample(pressure - porePsi);
      }
    }

    const hydraulicPower = Math.max(0, headPressurePsi ?? 0) * snapshot.pumpRateBpm / HHP_DIVISOR;
    peakHydraulicPower = Math.max(peakHydraulicPower, hydraulicPower);
    const limits = primary.equipmentLimits;
    // Limite excedido é alerta: a série continua mostrando o valor demandado.
    if (headPressurePsi !== null && limits.maxPressurePsi !== null && headPressurePsi > limits.maxPressurePsi)
      recordBreach('pump-pressure', headPressurePsi, limits.maxPressurePsi, snapshot);
    if (limits.maxRateBpm !== null && snapshot.pumpRateBpm > limits.maxRateBpm)
      recordBreach('pump-rate', snapshot.pumpRateBpm, limits.maxRateBpm, snapshot);
    const availableHp = limits.motorHp !== null && limits.efficiency !== null
      ? limits.motorHp * limits.efficiency : null;
    if (availableHp !== null && hydraulicPower > availableHp)
      recordBreach('hydraulic-power', hydraulicPower, availableHp, snapshot);

    points.push({ ...base,
      outletRateBpm: flowRate,
      // Anular cheio e aberto: o que sai pela saída ativa retorna na superfície.
      returnRateBpm: flowRate,
      // Sem vazão nada entra: densidade de entrada é indisponível, não a do topo.
      inletDensityPpg: snapshot.pumpRateBpm > 0 && !landed ? internal.at(0)?.fluid.densityPpg ?? null : null,
      requiredPumpPressurePsi: headPressurePsi,
      pumpPressurePsi: headPressurePsi,
      annularHydrostaticPsi, internalHydrostaticPsi,
      pipeFrictionPsi, annularFrictionPsi, localLossPsi,
      bhpPsi: balance.bhpPsi, ecdPpg: balance.ecdPpg,
      porePsi: outletWindow.porePpg !== null ? K * outletWindow.porePpg * outletTVD : null,
      fracturePsi: outletWindow.fracturePpg !== null ? K * outletWindow.fracturePpg * outletTVD : null,
      uTubeDrivePsi: balance.uTubeDrivePsi,
      state: landed ? 'plug-landed' : freeFall ? 'free-fall' : 'full',
      references: referenceRows,
    });
    snapshots.push({ ...snapshot, profiles });
  }

  for (const breach of breaches.values())
    diagnostics.push({ code: `PRIMARY_LIMIT_${breach.limit.toUpperCase().replace(/-/g, '_')}`,
      severity: 'warning',
      category: breach.limit === 'pore' || breach.limit === 'fracture' ? 'placement' : 'operational-limit',
      stageId: breach.stageId, stepId: breach.stepId ?? undefined,
      timeMin: breach.startTimeMin, endTimeMin: breach.endTimeMin,
      value: breach.peakValue, limit: breach.limitValue, md: breach.md, tvd: breach.tvd,
      message: `Limite de ${breach.limit} excedido entre ${breach.startTimeMin} e ${breach.endTimeMin} min; pico ${breach.peakValue} contra ${breach.limitValue}. A simulação continua com o programa solicitado.` });

  const availableHp = primary.equipmentLimits.motorHp !== null && primary.equipmentLimits.efficiency !== null
    ? primary.equipmentLimits.motorHp * primary.equipmentLimits.efficiency : null;
  return { points, snapshots,
    envelope: envelopeStatic.filter(entry => envelopeState.has(entry.md)).map(({ md, tvd, porePsi, fracturePsi }) => {
      const state = envelopeState.get(md)!;
      return { md, tvd, porePsi, fracturePsi,
        minAnnularPsi: state.min, maxAnnularPsi: state.max,
        minHydrostaticPsi: state.minHydrostatic,
        maxHydrostaticPsi: state.maxHydrostatic };
    }),
    breaches: [...breaches.values()], narrowestFractureMargin: narrowest,
    criticalByStep: [...criticalByStep.values()],
    hydraulicPowerUsagePct: availableHp !== null && availableHp > 0
      ? 100 * peakHydraulicPower / availableHp : null,
    diagnostics,
    status: diagnostics.some(d => d.severity === 'error') ? 'invalid'
      : outsideModel || transport.halted || diagnostics.some(d => d.severity === 'warning') ? 'partial' : 'complete' };
}
