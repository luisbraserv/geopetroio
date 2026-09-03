/**
 * Engine centralizado de cálculo de pasta de cimento.
 *
 * Base: 1 ft³ de cimento = 1 saco de 94 lb (American sack).
 * Todas as grandezas unitárias são por ft³ de cimento.
 *
 * Nomenclatura interna:
 *   facGpc  – galões de água por ft³ de cimento (= gal/sk)
 *   famGpc  – água + líquidos/dissolvidos/dispersos na água por ft³ de cimento
 *   yieldFt3PerFt3Cement – ft³ de pasta por ft³ de cimento (= ft³ pasta / sk)
 */

import {
  CEMENT_WEIGHT,
  VOL_WATER_FRESH,
  VOL_WATER_SEA,
  VOL_NACL,
  VOL_SILICA,
  LB_TO_KG,
  GAL_TO_L,
  FT3_TO_L,
} from '../models/constantes';
import { AditivoCalc } from '../models/aditivo.model';

export const GAL_PER_FT3  = 7.4805;
export const FT3_PER_BBL  = 5.6146;
export const GAL_PER_BBL  = 42;

/** Volume absoluto do cimento em gal/lb — base API para Classe G/A/B/C/D/E/F/H */
export const CEMENT_ABS_VOL_GAL_PER_LB = 0.0382;

/** Volume absoluto do cimento por saco (94 lb): 94 × 0,0382 = 3,5908 gal */
export const CEMENT_BASE_VOL_GAL = CEMENT_WEIGHT * CEMENT_ABS_VOL_GAL_PER_LB; // 3.5908

export interface SlurryEngineInput {
  targetDensityPpg: number;

  /** Fração de água doce [0–1] */
  freshWaterFraction: number;
  /** Fração de água do mar [0–1] */
  seaWaterFraction: number;

  /** Sílica %BWOC */
  silicaPct: number;
  /** NaCl %BWOW (sobre água doce) */
  naclPct: number;

  /**
   * Volume absoluto do cimento por saco em gal (cv da classe API).
   * Padrão: 3,5908 (classes A/B/G). Classes C e D/E/F/H têm cv próprio.
   */
  cementAbsVolGal?: number;

  /** Aditivos já calculados na base unitária */
  adds: AditivoCalc[];
}

export interface SlurryEngineResult {
  // ── Água ──────────────────────────────────────────────────────────────────
  waterWeightLbPerFt3Cement: number;
  waterFreshLb: number;
  waterSeaLb: number;
  waterGalPerFt3Cement: number;   // = facGpc

  // ── FAC / FAM ─────────────────────────────────────────────────────────────
  facGpc: number;    // galões de água por ft³ de cimento
  famGpc: number;    // água + líquidos dissolvidos/dispersos na água por ft³ de cimento
  facPercent: number; // informativo: waterWeightLb / 94 * 100

  // ── Sólidos ───────────────────────────────────────────────────────────────
  silicaWeightLb: number;
  silicaVolumeGal: number;
  naclWeightLb: number;
  naclVolumeGal: number;

  // ── Totais unitários (por ft³ de cimento) ─────────────────────────────────
  totalWeightLbPerFt3Cement: number;
  totalVolumeGalPerFt3Cement: number;

  // ── Densidade e rendimento ────────────────────────────────────────────────
  densityCheckPpg: number;      // deve ≈ targetDensityPpg
  densityError: boolean;        // true se |check - target| > 0.02 ppg
  yieldFt3PerFt3Cement: number; // ft³ pasta / sk
  yieldLPerSk: number;          // L / sk
}

/**
 * Calcula a receita unitária de pasta para 1 ft³ de cimento (1 saco de 94 lb).
 *
 * Usa fórmula direta sempre que possível.
 * Usa bissecção quando há sal BWOW ou aditivos dependentes da massa de água.
 */
export function calcSlurryEngine(input: SlurryEngineInput): SlurryEngineResult {
  const { targetDensityPpg, freshWaterFraction, seaWaterFraction, silicaPct, naclPct, adds } = input;

  // Volume absoluto do cimento: cv da classe quando informado, senão base A/B/G
  const cementVolGal = Number.isFinite(input.cementAbsVolGal) && (input.cementAbsVolGal as number) > 0
    ? (input.cementAbsVolGal as number)
    : CEMENT_BASE_VOL_GAL;

  // ── Volume absoluto misto da água ──────────────────────────────────────────
  const waterAbsVolGalPerLb =
    freshWaterFraction * VOL_WATER_FRESH + seaWaterFraction * VOL_WATER_SEA;

  // ── Sólidos fixos (independentes da água) ─────────────────────────────────
  const silicaWeightLb  = CEMENT_WEIGHT * silicaPct / 100;
  const silicaVolumeGal = silicaWeightLb * VOL_SILICA;

  // Aditivos: separar dependentes de água (BWOW / galPerBbl) dos independentes
  const waterIndependentAdds = adds.filter(
    a => a.dosageUnit !== 'percentBWOW' && a.dosageUnit !== 'galPerBbl' && a.dosageUnit !== 'lbPerBbl'
  );
  const waterDependentAdds = adds.filter(
    a => a.dosageUnit === 'percentBWOW' || a.dosageUnit === 'galPerBbl' || a.dosageUnit === 'lbPerBbl'
  );

  const fixedAddsWt  = waterIndependentAdds.reduce((s, a) => s + a.wt, 0);
  const fixedAddsVol = waterIndependentAdds.reduce((s, a) => s + a.vol, 0);

  // Pesos e volumes fixos (sem água e sem sal e sem aditivos dependentes da água)
  const fixedWeightLb  = CEMENT_WEIGHT + silicaWeightLb + fixedAddsWt;
  const fixedVolumeGal = cementVolGal + silicaVolumeGal + fixedAddsVol;

  // Recalcula um aditivo dependente da água para uma massa de água candidata,
  // preservando a razão volume/massa (densidade ou volume absoluto) do pré-cálculo.
  const recalcDepAdd = (a: AditivoCalc, wF: number, wS: number, slurryVolGalSemDep: number): { wt: number; vol: number } => {
    const volPerWt = a.wt > 0 ? a.vol / a.wt : 0;
    const wtPerVol = a.vol > 0 ? a.wt / a.vol : 0;
    if (a.dosageUnit === 'percentBWOW') {
      const wt = (wF + wS) * a.conc / 100;
      return { wt, vol: wt * volPerWt };
    }
    if (a.dosageUnit === 'galPerBbl') {
      const baseBbl = (wF * VOL_WATER_FRESH + wS * VOL_WATER_SEA) / GAL_PER_BBL;
      const vol = baseBbl * a.conc;
      return { wt: vol * wtPerVol, vol };
    }
    // lbPerBbl — volume de pasta aproximado (sem os próprios dependentes)
    const wt = a.conc * slurryVolGalSemDep / GAL_PER_BBL;
    return { wt, vol: wt * volPerWt };
  };

  const sumDepAdds = (wF: number, wS: number, slurryVolGalSemDep: number): { wt: number; vol: number } =>
    waterDependentAdds.reduce((acc, a) => {
      const r = recalcDepAdd(a, wF, wS, slurryVolGalSemDep);
      return { wt: acc.wt + r.wt, vol: acc.vol + r.vol };
    }, { wt: 0, vol: 0 });

  let waterWeightLb: number;

  const hasWaterDependents = naclPct > 0 || waterDependentAdds.length > 0;

  if (!hasWaterDependents) {
    // ── Fórmula direta ──────────────────────────────────────────────────────
    // density = (fixedWt + w) / (fixedVol + w * absVol)
    // → w = (fixedWt - density * fixedVol) / (density * absVol - 1)
    const num = targetDensityPpg * fixedVolumeGal - fixedWeightLb;
    const den = 1 - targetDensityPpg * waterAbsVolGalPerLb;
    waterWeightLb = den !== 0 ? num / den : 0;
  } else {
    // ── Bissecção (quando há sal BWOW ou aditivos dependentes da água) ───────
    let lo = 0.1;
    let hi = freshWaterFraction > 0 ? 200 / freshWaterFraction : 200;

    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const wF  = mid * freshWaterFraction;
      const wS  = mid * seaWaterFraction;
      const nacl = wF * naclPct / 100;
      const volSemDep = fixedVolumeGal + wF * VOL_WATER_FRESH + wS * VOL_WATER_SEA + nacl * VOL_NACL;
      const dep = sumDepAdds(wF, wS, volSemDep);
      const tw = fixedWeightLb + wF + wS + nacl + dep.wt;
      const tv = volSemDep + dep.vol;
      const rho = tw / tv;
      if (rho > targetDensityPpg) lo = mid; else hi = mid;
    }
    waterWeightLb = (lo + hi) / 2;
  }

  waterWeightLb = Math.max(0, waterWeightLb);

  const waterFreshLb    = waterWeightLb * freshWaterFraction;
  const waterSeaLb      = waterWeightLb * seaWaterFraction;
  const waterVolumeGal  = waterFreshLb * VOL_WATER_FRESH + waterSeaLb * VOL_WATER_SEA;

  // Sal após determinar a água
  const naclWeightLb  = waterFreshLb * naclPct / 100;
  const naclVolumeGal = naclWeightLb * VOL_NACL;

  // Aditivos dependentes da água: consolidar com a água real convergida e
  // gravar de volta nos AditivoCalc para receita/FAM usarem valores coerentes.
  const volSemDepFinal = fixedVolumeGal + waterVolumeGal + naclVolumeGal;
  for (const a of waterDependentAdds) {
    const r = recalcDepAdd(a, waterFreshLb, waterSeaLb, volSemDepFinal);
    const volScale = a.vol > 0 ? r.vol / a.vol : 0;
    a.absoluteVolumeGal = a.absoluteVolumeGal != null && Number.isFinite(a.absoluteVolumeGal)
      ? a.absoluteVolumeGal * volScale
      : r.vol;
    a.wt  = r.wt;
    a.vol = r.vol;
  }
  const depAddsWt  = waterDependentAdds.reduce((s, a) => s + a.wt, 0);
  const depAddsVol = waterDependentAdds.reduce((s, a) => s + a.vol, 0);

  // ── Totais ────────────────────────────────────────────────────────────────
  const totalWeightLb  = fixedWeightLb  + waterWeightLb + naclWeightLb + depAddsWt;
  const totalVolumeGal = fixedVolumeGal + waterVolumeGal + naclVolumeGal + depAddsVol;

  const densityCheckPpg = totalVolumeGal > 0 ? totalWeightLb / totalVolumeGal : 0;
  const densityError    = Math.abs(densityCheckPpg - targetDensityPpg) > 0.02;

  // ── FAC / FAM ─────────────────────────────────────────────────────────────
  const facGpc = waterVolumeGal;

  // FAM = água + aditivos líquidos + sal (dispersos/dissolvidos na água)
  const liquidAdditiveVol = adds
    .filter(a => a.type === 'liquid')
    .reduce((s, a) => s + a.vol, 0);
  const famGpc = waterVolumeGal + liquidAdditiveVol + naclVolumeGal;

  const facPercent = CEMENT_WEIGHT > 0 ? waterWeightLb / CEMENT_WEIGHT * 100 : 0;

  // ── Rendimento ────────────────────────────────────────────────────────────
  const yieldFt3PerFt3Cement = totalVolumeGal / GAL_PER_FT3;
  const yieldLPerSk          = yieldFt3PerFt3Cement * FT3_TO_L;

  return {
    waterWeightLbPerFt3Cement: waterWeightLb,
    waterFreshLb,
    waterSeaLb,
    waterGalPerFt3Cement: waterVolumeGal,
    facGpc,
    famGpc,
    facPercent,
    silicaWeightLb,
    silicaVolumeGal,
    naclWeightLb,
    naclVolumeGal,
    totalWeightLbPerFt3Cement: totalWeightLb,
    totalVolumeGalPerFt3Cement: totalVolumeGal,
    densityCheckPpg,
    densityError,
    yieldFt3PerFt3Cement,
    yieldLPerSk,
  };
}

/** Escala a receita unitária para um volume alvo de pasta em BBL */
export interface SlurryScaleResult {
  targetSlurryVolumeBbl: number;
  targetSlurryVolumeFt3: number;
  cementRequiredFt3: number;
  sacks94lb: number;
  totalCementLb: number;
  totalCementKg: number;
  totalWaterGal: number;
  totalWaterBbl: number;
  scaleFactor: number;
}

export function scaleSlurry(
  unitResult: SlurryEngineResult,
  slurryVolumeBbl: number,
): SlurryScaleResult {
  const targetFt3      = slurryVolumeBbl * FT3_PER_BBL;
  const cementFt3      = unitResult.yieldFt3PerFt3Cement > 0
    ? targetFt3 / unitResult.yieldFt3PerFt3Cement
    : 0;
  const scaleFactor    = cementFt3;                        // ft³ de cimento necessários
  const totalCementLb  = scaleFactor * CEMENT_WEIGHT;
  const totalWaterGal  = unitResult.facGpc * scaleFactor;

  return {
    targetSlurryVolumeBbl: slurryVolumeBbl,
    targetSlurryVolumeFt3: targetFt3,
    cementRequiredFt3: cementFt3,
    sacks94lb: cementFt3,
    totalCementLb,
    totalCementKg: totalCementLb * LB_TO_KG,
    totalWaterGal,
    totalWaterBbl: totalWaterGal / GAL_PER_BBL,
    scaleFactor,
  };
}
