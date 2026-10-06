/**
 * Perda de carga por atrito da primária, pelo método de R3 (Nelson e Guillot,
 * *Well Cementing*, 2ª ed., §4-6.1 e §4-6.2, Eqs. 4-136 a 4-158), para fluido de
 * lei de potência em tubo e em anular concêntrico estreito (aproximação de fenda).
 *
 * - Reynolds generalizado de Metzner e Reed, com o índice de consistência do
 *   tubo `k·((3n+1)/4n)^n` e do anular `k·((2n+1)/3n)^n`.
 * - Laminar: `f = 16/Re` no tubo e `f = 24/Re` no anular.
 * - Turbulento: Dodge e Metzner, `1/√f = (4/n^0,75)·log(Re·f^(1−n/2)) − 0,4/n^1,2`;
 *   no anular o Reynolds entra multiplicado por 2/3 (Eq. 4-158).
 * - Fim do laminar `3250 − 1150n` e fim da transição `4150 − 1150n`, com
 *   interpolação log-log de f entre esses dois pontos (Eqs. 4-148 e 4-151).
 *
 * Substitui a tabela F-40 do Petroguia (R2) na primária: impressa, ela passa de
 * `16/Re` para `0,11·n^0,616·Re^-0,287` em Re=400 sem continuidade, e a perda cai
 * quando a vazão sobe. Sem fator de rugosidade qualitativo e sem limitar `n`:
 * reologia inválida devolve `null`, nunca uma pasta padrão.
 */
export type PrimaryFlowRegime = 'static' | 'laminar' | 'transitional' | 'turbulent';

export const PRIMARY_FRICTION_CORRELATION = { id: 'r3-guillot-4-6', version: 'primaria-2' } as const;

export interface PrimaryFrictionInput {
  /** bpm; zero devolve perda zero antes de calcular Reynolds. */
  flowRateBpm: number;
  densityPpg: number;
  n: number;
  kLbfSnFt2: number;
  lengthM: number;
}

export interface PrimaryFrictionResult {
  velocityFtS: number;
  /** Diâmetro do tubo ou folga anular `D_externo − OD`, em polegadas. */
  hydraulicDiameterIn: number;
  reynolds: number | null;
  frictionFactor: number | null;
  regime: PrimaryFlowRegime;
  pressureDropPsi: number | null;
  /** Limites de regime desta correlação para o `n` do fluido; não são universais. */
  laminarLimitRe: number | null;
  turbulentLimitRe: number | null;
}

const PPG_TO_KG_M3 = 119.826427;
const LBF_FT2_TO_PA = 47.880259;
const IN_TO_M = 0.0254;
const BPM_TO_M3_S = 0.158987294928 / 60;
const PA_TO_PSI = 1 / 6894.757293;
const M_S_TO_FT_S = 1 / 0.3048;

/** Fim do laminar e fim da transição (R3 Eqs. 4-148 e 4-151). */
export function primaryRegimeLimits(n: number): { laminar: number; turbulent: number } {
  return { laminar: 3250 - 1150 * n, turbulent: 4150 - 1150 * n };
}

/** Dodge e Metzner (Eq. 4-146), resolvido por ponto fixo em `1/√f`. */
function dodgeMetzner(n: number, reynolds: number): number | null {
  const h = 4 / n ** 0.75;
  const j = -0.4 / n ** 1.2;
  let f = 0.005;
  for (let i = 0; i < 200; i++) {
    const inverseRoot = h * Math.log10(reynolds * f ** (1 - n / 2)) + j;
    if (!Number.isFinite(inverseRoot) || inverseRoot <= 0) return null;
    const next = 1 / inverseRoot ** 2;
    if (Math.abs(next - f) <= 1e-14 * next) return next;
    f = next;
  }
  return Number.isFinite(f) && f > 0 ? f : null;
}

interface Geometry { laminar: (re: number) => number; turbulentScale: number }
const PIPE: Geometry = { laminar: re => 16 / re, turbulentScale: 1 };
const ANNULUS: Geometry = { laminar: re => 24 / re, turbulentScale: 2 / 3 };

/**
 * Fator de Fanning e regime para um Reynolds generalizado. Com `n` baixo, o
 * turbulento pode ficar abaixo do laminar no fim nominal da transição; R3 manda
 * então usar a interseção das duas curvas como fim da transição (p. 133–134).
 */
interface TransitionEnd { laminar: number; upper: number; fUpper: number }
/** Fim da transição por geometria e `n`; o solver de queda livre chama isto milhares de vezes. */
const pipeTransitions = new Map<number, TransitionEnd | 'laminar-only' | 'invalid'>();
const annulusTransitions = new Map<number, TransitionEnd | 'laminar-only' | 'invalid'>();

function transitionEnd(geometry: Geometry, n: number): TransitionEnd | 'laminar-only' | 'invalid' {
  const cache = geometry === PIPE ? pipeTransitions : annulusTransitions;
  const cached = cache.get(n);
  if (cached) return cached;
  const limits = primaryRegimeLimits(n);
  const turbulentAt = (re: number) => dodgeMetzner(n, re * geometry.turbulentScale);
  let upper = limits.turbulent;
  let fUpper = turbulentAt(upper);
  let result: TransitionEnd | 'laminar-only' | 'invalid';
  if (fUpper === null) result = 'invalid';
  else if (fUpper >= geometry.laminar(upper)) result = { laminar: limits.laminar, upper, fUpper };
  else {
    let low = upper;
    let high = upper;
    let found = false;
    for (let i = 0; i < 60 && !found; i++) {
      high *= 2;
      const value = turbulentAt(high);
      if (value !== null && value >= geometry.laminar(high)) found = true;
    }
    if (!found) result = 'laminar-only';
    else {
      for (let i = 0; i < 100; i++) {
        const middle = Math.sqrt(low * high);
        const value = turbulentAt(middle);
        if (value !== null && value >= geometry.laminar(middle)) high = middle; else low = middle;
      }
      upper = high;
      fUpper = turbulentAt(upper);
      result = fUpper === null ? 'invalid' : { laminar: limits.laminar, upper, fUpper };
    }
  }
  if (cache.size > 1000) cache.clear();
  cache.set(n, result);
  return result;
}

function fanning(geometry: Geometry, n: number, reynolds: number):
  { f: number; regime: PrimaryFlowRegime; laminar: number; turbulent: number } | null {
  const end = transitionEnd(geometry, n);
  if (end === 'invalid') return null;
  const limits = primaryRegimeLimits(n);
  if (end === 'laminar-only')
    return { f: geometry.laminar(reynolds), regime: 'laminar', laminar: limits.laminar, turbulent: limits.turbulent };
  if (reynolds <= end.laminar) return { f: geometry.laminar(reynolds), regime: 'laminar', laminar: end.laminar, turbulent: end.upper };
  if (reynolds >= end.upper) {
    const f = dodgeMetzner(n, reynolds * geometry.turbulentScale);
    return f === null ? null : { f, regime: 'turbulent', laminar: end.laminar, turbulent: end.upper };
  }
  const f1 = geometry.laminar(end.laminar);
  const t = Math.log(reynolds / end.laminar) / Math.log(end.upper / end.laminar);
  return { f: Math.exp(Math.log(f1) + t * Math.log(end.fUpper / f1)), regime: 'transitional',
    laminar: end.laminar, turbulent: end.upper };
}

function solve(input: PrimaryFrictionInput, geometry: Geometry, areaIn2: number,
  hydraulicDiameterIn: number, consistencyFactor: (n: number) => number, lengthScale: number): PrimaryFrictionResult {
  const { flowRateBpm, densityPpg, n, kLbfSnFt2, lengthM } = input;
  const invalid = (regime: PrimaryFlowRegime, velocityFtS = 0): PrimaryFrictionResult => ({ velocityFtS,
    hydraulicDiameterIn, reynolds: null, frictionFactor: null, regime, pressureDropPsi: null,
    laminarLimitRe: null, turbulentLimitRe: null });
  if (!Number.isFinite(areaIn2) || areaIn2 <= 0 || !Number.isFinite(hydraulicDiameterIn) || hydraulicDiameterIn <= 0)
    return invalid('laminar');
  if (flowRateBpm === 0) {
    const limits = Number.isFinite(n) && n > 0 ? primaryRegimeLimits(n) : null;
    return { velocityFtS: 0, hydraulicDiameterIn, reynolds: null, frictionFactor: null, regime: 'static',
      pressureDropPsi: 0, laminarLimitRe: limits?.laminar ?? null, turbulentLimitRe: limits?.turbulent ?? null };
  }
  if (![flowRateBpm, densityPpg, n, kLbfSnFt2, lengthM].every(Number.isFinite) ||
    flowRateBpm < 0 || densityPpg <= 0 || n <= 0 || kLbfSnFt2 <= 0 || lengthM < 0) return invalid('laminar');
  const rho = densityPpg * PPG_TO_KG_M3;
  const k = kLbfSnFt2 * LBF_FT2_TO_PA * consistencyFactor(n);
  const velocity = flowRateBpm * BPM_TO_M3_S / (areaIn2 * IN_TO_M ** 2);
  const dh = hydraulicDiameterIn * IN_TO_M;
  const reynolds = rho * velocity ** (2 - n) * dh ** n / (lengthScale ** (n - 1) * k);
  if (!Number.isFinite(reynolds) || reynolds <= 0) return invalid('laminar', velocity * M_S_TO_FT_S);
  const friction = fanning(geometry, n, reynolds);
  if (!friction || !Number.isFinite(friction.f) || friction.f <= 0) return invalid('laminar', velocity * M_S_TO_FT_S);
  // τ_parede = f·ρ·v²/2 e ΔP = 4·τ_parede·L/D_h (R3 Eqs. 4-135, 4-14 e 4-17).
  const pressureDropPa = 4 * friction.f * rho * velocity ** 2 / 2 * lengthM / dh;
  return { velocityFtS: velocity * M_S_TO_FT_S, hydraulicDiameterIn, reynolds, frictionFactor: friction.f,
    regime: friction.regime, pressureDropPsi: Number.isFinite(pressureDropPa) ? pressureDropPa * PA_TO_PSI : null,
    laminarLimitRe: friction.laminar, turbulentLimitRe: friction.turbulent };
}

/** Tubo: Reynolds com `8^(n−1)` e `k·((3n+1)/4n)^n` (R3 Eqs. 4-137 e 4-145). */
export function primaryPipeFriction(input: PrimaryFrictionInput, insideDiameterIn: number): PrimaryFrictionResult {
  return solve(input, PIPE, Math.PI / 4 * insideDiameterIn ** 2, insideDiameterIn,
    n => ((3 * n + 1) / (4 * n)) ** n, 8);
}

/** Anular: fenda com `D_externo − OD`, `12^(n−1)` e `k·((2n+1)/3n)^n` (R3 Eqs. 4-154 a 4-158). */
export function primaryAnnularFriction(input: PrimaryFrictionInput,
  outerDiameterIn: number, pipeOuterDiameterIn: number): PrimaryFrictionResult {
  if (!(outerDiameterIn > pipeOuterDiameterIn))
    return { velocityFtS: 0, hydraulicDiameterIn: 0, reynolds: null, frictionFactor: null, regime: 'laminar',
      pressureDropPsi: null, laminarLimitRe: null, turbulentLimitRe: null };
  return solve(input, ANNULUS, Math.PI / 4 * (outerDiameterIn ** 2 - pipeOuterDiameterIn ** 2),
    outerDiameterIn - pipeOuterDiameterIn, n => ((2 * n + 1) / (3 * n)) ** n, 12);
}

/**
 * Correção opcional de excentricidade do Petroguia (R2 F-40), restrita às
 * geometrias de referência. Coeficiente fora de domínio devolve `null`.
 */
export function primaryEccentricityFactor(geometry: '8.5x7' | '12.25x9.625',
  n: number, standoffPct: number): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(standoffPct) || standoffPct < 0 || standoffPct > 100) return null;
  const [a, b] = geometry === '8.5x7' ? [0.44, 0.18] : [0.43, 0.19];
  const factor = 1 - (a + b * n) * (1 - standoffPct / 100);
  return Number.isFinite(factor) && factor > 0 ? factor : null;
}
