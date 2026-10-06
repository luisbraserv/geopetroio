import type { PrimaryConfiguration } from '../models/primary-cementing.model';
import { DEFAULT_MARGIN_CLASSES, type MarginClasses, type MarginStatus, type PressureGradientUnit,
  type PressureProfileInput } from '../models/pressure-profile.model';
import { K } from './primary-hydraulics';

/** psi/ft por ppg: o mesmo fator do K do motor (K = 0,052 × 3,28084 psi/(ppg·m)). */
export const PSI_FT_PER_PPG = 0.052;

export const toPpg = (value: number, unit: PressureGradientUnit): number => unit === 'psi/ft' ? value / PSI_FT_PER_PPG : value;
export const fromPpg = (value: number, unit: PressureGradientUnit): number => unit === 'psi/ft' ? value * PSI_FT_PER_PPG : value;

export interface PressureProfilePpgPoint { tvd: number; porePpg: number; fracturePpg: number }

const finiteNumber = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return value !== null && value !== '' && Number.isFinite(n) ? n : null;
};

/**
 * Pontos em ppg, ordenados pela TVD. No modo por TVD valem os pontos completos (TVD, poro e
 * fratura); sem nenhum, vale o constante, como um cenário antigo.
 */
export function profilePointsPpg(input: PressureProfileInput): PressureProfilePpgPoint[] {
  const constant = [{ tvd: 0, porePpg: toPpg(input.pore, input.unit), fracturePpg: toPpg(input.fracture, input.unit) }];
  if (input.mode !== 'table') return constant;
  const points = input.points
    .map(p => ({ tvd: finiteNumber(p.tvdM), pore: finiteNumber(p.pore), fracture: finiteNumber(p.fracture) }))
    .filter((p): p is { tvd: number; pore: number; fracture: number } => p.tvd !== null && p.tvd >= 0 && p.pore !== null && p.fracture !== null)
    .sort((a, b) => a.tvd - b.tvd)
    .map(p => ({ tvd: p.tvd, porePpg: toPpg(p.pore, input.unit), fracturePpg: toPpg(p.fracture, input.unit) }));
  return points.length ? points : constant;
}

/** Poro e fratura (ppg) numa TVD: linear entre os pontos; fora da tabela, o ponto mais próximo. */
export function profileAt(input: PressureProfileInput | PressureProfilePpgPoint[], tvd: number): { porePpg: number; fracturePpg: number } {
  const points = Array.isArray(input) ? input : profilePointsPpg(input);
  const first = points[0]; const last = points.at(-1)!;
  if (tvd <= first.tvd || points.length === 1) return { porePpg: first.porePpg, fracturePpg: first.fracturePpg };
  if (tvd >= last.tvd) return { porePpg: last.porePpg, fracturePpg: last.fracturePpg };
  const i = points.findIndex(p => p.tvd >= tvd);
  const a = points[i - 1]; const b = points[i];
  const f = b.tvd > a.tvd ? (tvd - a.tvd) / (b.tvd - a.tvd) : 0;
  return { porePpg: a.porePpg + (b.porePpg - a.porePpg) * f, fracturePpg: a.fracturePpg + (b.fracturePpg - a.fracturePpg) * f };
}

/** Poro e fratura (ppg) de uma entrada do motor numa TVD: pelo perfil, quando houver; senão, os gradientes únicos. */
export function gradientsAt(input: { poreGradPpg: number; fracGradPpg: number; pressureProfile?: PressureProfileInput | null },
  tvd: number): { porePpg: number; fracturePpg: number } {
  return input.pressureProfile ? profileAt(input.pressureProfile, tvd) : { porePpg: input.poreGradPpg, fracturePpg: input.fracGradPpg };
}

/** Primeira MD do trecho com TVD ≥ `tvd` (a TVD não diminui com a MD). */
function mdAtTvd(tvd: number, topMD: number, bottomMD: number, tvdOf: (md: number) => number): number {
  let lo = topMD; let hi = bottomMD;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (tvdOf(mid) < tvd) lo = mid; else hi = mid; }
  return hi;
}

/**
 * Linhas da janela do motor para um trecho de MD, quebradas nas TVDs da tabela: o motor
 * interpola em TVD dentro de cada linha, então o perfil entra sem aproximação.
 */
export function profileWindowRows(input: PressureProfileInput, range: { topMD: number; bottomMD: number },
  tvdOf: (md: number) => number, exposed?: boolean): PrimaryConfiguration['pressureWindow'] {
  const points = profilePointsPpg(input);
  const { topMD, bottomMD } = range;
  if (!(bottomMD > topMD)) return [];
  const topTVD = tvdOf(topMD); const bottomTVD = tvdOf(bottomMD);
  const breaks = [...new Set([topMD, bottomMD, ...points.filter(p => p.tvd > topTVD && p.tvd < bottomTVD)
    .map(p => mdAtTvd(p.tvd, topMD, bottomMD, tvdOf))])].sort((a, b) => a - b);
  const rows: PrimaryConfiguration['pressureWindow'] = [];
  for (let i = 1; i < breaks.length; i++) {
    const a = breaks[i - 1]; const b = breaks[i];
    if (!(b > a)) continue;
    const top = profileAt(points, tvdOf(a)); const bottom = profileAt(points, tvdOf(b));
    rows.push({ topMD: a, bottomMD: b, topPorePpg: top.porePpg, porePpg: bottom.porePpg,
      topFracturePpg: top.fracturePpg, fracturePpg: bottom.fracturePpg, ...(exposed ? { exposed: true } : {}) });
  }
  return rows;
}

/** Margem em ppg na profundidade: a folga em psi dividida por K · TVD. */
export const marginPpg = (marginPsi: number, tvd: number): number | null => tvd > 0 ? marginPsi / (K * tvd) : null;

/** Classes do cenário em ordem (atenção ≥ alerta ≥ crítico ≥ 0); o que faltar volta ao padrão. */
export function normalizeMarginClasses(raw: Partial<Record<keyof MarginClasses, unknown>> | null | undefined): MarginClasses {
  const value = (key: keyof MarginClasses) => {
    const n = finiteNumber(raw?.[key]);
    return n !== null && n >= 0 ? n : DEFAULT_MARGIN_CLASSES[key];
  };
  const critico = value('criticoPpg');
  const alerta = Math.max(critico, value('alertaPpg'));
  return { criticoPpg: critico, alertaPpg: alerta, atencaoPpg: Math.max(alerta, value('atencaoPpg')) };
}

/** Situação de um ponto pelas duas margens (ppg): negativa é fratura ou influxo; senão, a classe da menor. */
export function classifyMargins(fractureMarginPpg: number | null, poreMarginPpg: number | null, classes: MarginClasses): MarginStatus {
  if (fractureMarginPpg !== null && fractureMarginPpg < 0) return 'fratura';
  if (poreMarginPpg !== null && poreMarginPpg < 0) return 'influxo';
  const margins = [fractureMarginPpg, poreMarginPpg].filter((v): v is number => v !== null);
  if (!margins.length) return 'normal';
  const m = Math.min(...margins);
  return m < classes.criticoPpg ? 'critico' : m < classes.alertaPpg ? 'alerta' : m < classes.atencaoPpg ? 'atencao' : 'normal';
}

/** Perfil a partir do formulário do squeeze ou do tampão; cenário antigo abre constante em ppg. */
export function pressureProfileFromForm(v: Record<string, unknown>): PressureProfileInput {
  const unit: PressureGradientUnit = v['gradUnit'] === 'psi/ft' ? 'psi/ft' : 'ppg';
  const fallback = (key: string, ppg: number) => finiteNumber(v[key]) ?? fromPpg(ppg, unit);
  const points = Array.isArray(v['gradPoints']) ? (v['gradPoints'] as Record<string, unknown>[]).map(p => ({
    tvdM: Number(p['tvd']), pore: Number(p['poro']), fracture: Number(p['fratura']) })) : [];
  return { unit, mode: v['gradMode'] === 'table' ? 'table' : 'constant',
    pore: fallback('poreGrad', 9), fracture: fallback('fracGrad', 16), points };
}
