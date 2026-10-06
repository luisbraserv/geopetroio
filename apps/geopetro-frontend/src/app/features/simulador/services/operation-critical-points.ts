import { MARGIN_STATUS_LABELS, type MarginClasses, type MarginStatus } from '../models/pressure-profile.model';
import type { PrimaryCriticalSample, PrimaryHydraulicsResult } from '../models/primary-hydraulics.model';
import type { WellGeometry } from '../models/well-geometry.model';
import { classifyMargins, marginPpg } from './pressure-profile';
import { tableReportSvg } from './operation-tables';
import { K } from './primary-hydraulics';
import type { SqueezeCompressionResult } from './work-string-compression';

/**
 * Ponto crítico por etapa (SPEC janela-operacional §3.3): em cada etapa, onde a pressão do
 * poço chega mais perto da fratura e onde fica mais perto do poro, na formação exposta; e,
 * no squeeze, a pressão interna do revestimento contra a ruptura, quando informada.
 */
export interface CriticalPointView {
  md: number; tvd: number; timeMin: number; elemento: string;
  porePsi: number | null; pressurePsi: number; fracturePsi: number | null; ecdPpg: number | null;
  fractureMarginPsi: number | null; fractureMarginPpg: number | null;
  poreMarginPsi: number | null; poreMarginPpg: number | null;
  status: MarginStatus;
}
export interface CriticalStepView { etapa: string; fracture: CriticalPointView | null; pore: CriticalPointView | null; status: MarginStatus }
export interface CasingCheckView { md: number; tvd: number; pressurePsi: number; burstPsi: number; marginPsi: number; exceeded: boolean }
export interface OperationCriticalPoints {
  steps: CriticalStepView[];
  /** O ponto de menor margem (em ppg) de todas as etapas, fratura ou poro. */
  worst: (CriticalPointView & { etapa: string; kind: 'fracture' | 'pore' }) | null;
  casing: CasingCheckView | null;
  classes: MarginClasses;
}

/** Nome do lugar: canhoneado, sapata com poço aberto logo abaixo ou poço aberto. */
export function wellElementOf(geometry: WellGeometry | null, perforations: { top: number; base: number }[]): (md: number) => string {
  const shoes = (geometry?.phases ?? []).flatMap(phase => phase.casing ? [{ md: phase.casing.bottomMD, od: phase.casing.odIn }] : []);
  const inch = (od: number) => `${od.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}"`;
  const meters = (md: number) => md.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return md => {
    const perf = perforations.find(p => md >= Math.min(p.top, p.base) - 0.01 && md <= Math.max(p.top, p.base) + 0.01);
    if (perf) return `Canhoneado ${meters(Math.min(perf.top, perf.base))}–${meters(Math.max(perf.top, perf.base))} m`;
    const shoe = shoes.find(s => md >= s.md - 0.01 && md - s.md <= 15);
    return shoe ? `Sapata do ${inch(shoe.od)} (${meters(shoe.md)} m)` : 'Poço aberto';
  };
}

export interface CriticalPointsInput {
  hydraulics: PrimaryHydraulicsResult | null | undefined;
  stepLabels: Record<string, string>;
  /** Squeeze: a compressão entra como uma etapa própria. */
  compression?: SqueezeCompressionResult | null;
  /** Poro e fratura (ppg) numa TVD, do perfil do cenário. */
  gradientsAt: (tvd: number) => { porePpg: number; fracturePpg: number };
  tvdOf: (md: number) => number;
  elementOf: (md: number) => string;
  classes: MarginClasses;
  casingBurstPsi?: number | null;
}

export function buildCriticalPoints(input: CriticalPointsInput): OperationCriticalPoints {
  const view = (md: number, tvd: number, timeMin: number, pressurePsi: number, porePsi: number | null,
    fracturePsi: number | null): CriticalPointView => {
    const fractureMarginPsi = fracturePsi !== null ? fracturePsi - pressurePsi : null;
    const poreMarginPsi = porePsi !== null ? pressurePsi - porePsi : null;
    const fractureMarginPpg = fractureMarginPsi !== null ? marginPpg(fractureMarginPsi, tvd) : null;
    const poreMarginPpg = poreMarginPsi !== null ? marginPpg(poreMarginPsi, tvd) : null;
    return { md, tvd, timeMin, elemento: input.elementOf(md), porePsi, pressurePsi, fracturePsi,
      ecdPpg: tvd > 0 ? pressurePsi / (K * tvd) : null, fractureMarginPsi, fractureMarginPpg, poreMarginPsi, poreMarginPpg,
      status: classifyMargins(fractureMarginPpg, poreMarginPpg, input.classes) };
  };
  const fromSample = (s: PrimaryCriticalSample | null) => s ? view(s.md, s.tvd, s.timeMin, s.pressurePsi, s.porePsi, s.fracturePsi) : null;
  const step = (etapa: string, fracture: CriticalPointView | null, pore: CriticalPointView | null): CriticalStepView =>
    ({ etapa, fracture, pore, status: classifyMargins(fracture?.fractureMarginPpg ?? null, pore?.poreMarginPpg ?? null, input.classes) });

  const steps: CriticalStepView[] = (input.hydraulics?.criticalByStep ?? [])
    .filter(s => s.fracture || s.pore)
    .map(s => step(s.stepId ? input.stepLabels[s.stepId] ?? s.stepId : 'Início (poço parado)', fromSample(s.fracture), fromSample(s.pore)));

  // Compressão (squeeze): o ponto mais crítico do canhoneado em cada instante, pela folga do motor.
  const compression = input.compression;
  if (compression?.points.length) {
    let fracture: CriticalPointView | null = null;
    let pore: CriticalPointView | null = null;
    for (const p of compression.points) {
      // A folga do instante na profundidade crítica: fratura do perfil ali menos a pressão do poço ali
      // (com vazio no topo da coluna, "limite − aplicada" não é a folga do instante).
      const tvd = input.tvdOf(p.criticalMD);
      const at = input.gradientsAt(tvd);
      const candidate = view(p.criticalMD, tvd, p.timeMin, p.criticalPressurePsi, K * at.porePpg * tvd, K * at.fracturePpg * tvd);
      if (!fracture || (candidate.fractureMarginPsi ?? Infinity) < (fracture.fractureMarginPsi ?? Infinity)) fracture = candidate;
      const ref = p.references.find(r => r.id === 'perforations');
      if (ref) {
        const refAt = input.gradientsAt(ref.tvd);
        const refView = view(ref.md, ref.tvd, p.timeMin, ref.pressurePsi, K * refAt.porePpg * ref.tvd, K * refAt.fracturePpg * ref.tvd);
        if (!pore || (refView.poreMarginPsi ?? Infinity) < (pore.poreMarginPsi ?? Infinity)) pore = refView;
      }
    }
    steps.push(step('Compressão', fracture, pore));
  }

  let worst: OperationCriticalPoints['worst'] = null;
  for (const s of steps)
    for (const [kind, point, margin] of [['fracture', s.fracture, s.fracture?.fractureMarginPpg], ['pore', s.pore, s.pore?.poreMarginPpg]] as const)
      if (point && margin != null) {
        const current = worst ? (worst.kind === 'fracture' ? worst.fractureMarginPpg : worst.poreMarginPpg) ?? Infinity : Infinity;
        if (margin < current) worst = { ...point, etapa: s.etapa, kind };
      }

  // Revestimento: a maior pressão interna da compressão contra a ruptura informada.
  let casing: CasingCheckView | null = null;
  const burst = input.casingBurstPsi;
  if (burst && burst > 0 && compression?.casingEnvelope.length) {
    const top = compression.casingEnvelope.reduce((a, b) => b.maxPressurePsi > a.maxPressurePsi ? b : a);
    casing = { md: top.md, tvd: top.tvd, pressurePsi: top.maxPressurePsi, burstPsi: burst,
      marginPsi: burst - top.maxPressurePsi, exceeded: top.maxPressurePsi > burst };
  }
  return { steps, worst, casing, classes: input.classes };
}

/** Tabela do relatório: margens por etapa; onde e o ponto mais crítico vão nas notas. */
export function criticalPointsTableSvg(data: OperationCriticalPoints): string {
  const n = (value: number | null | undefined, digits: number) => value == null || !Number.isFinite(value) ? '—'
    : value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const margin = (psi: number | null | undefined, ppg: number | null | undefined) => psi == null ? '—' : `${n(psi, 0)} psi / ${n(ppg, 2)}`;
  const rows = data.steps.map(step => [step.etapa, margin(step.fracture?.fractureMarginPsi, step.fracture?.fractureMarginPpg),
    n(step.fracture?.md, 1), margin(step.pore?.poreMarginPsi, step.pore?.poreMarginPpg), MARGIN_STATUS_LABELS[step.status]]);
  const w = data.worst;
  const notes = [
    ...(w ? [`Ponto mais critico: ${w.etapa}, ${w.elemento}, MD ${n(w.md, 1)} m / TVD ${n(w.tvd, 1)} m - ${MARGIN_STATUS_LABELS[w.status]}.`,
      `Poros ${n(w.porePsi, 0)} psi | poco ${n(w.pressurePsi, 0)} psi | fratura ${n(w.fracturePsi, 0)} psi | ECD ${n(w.ecdPpg, 3)} ppg | `
        + `margem de fratura ${margin(w.fractureMarginPsi, w.fractureMarginPpg)} ppg | para influxo ${margin(w.poreMarginPsi, w.poreMarginPpg)} ppg.`]
      : ['Sem formacao exposta no trecho calculado.']),
    ...(data.steps.some(s => s.fracture) ? [`Onde fica a menor margem ate a fratura: ${[...new Set(data.steps
      .flatMap(s => s.fracture ? [s.fracture.elemento] : []))].join('; ')}.`] : []),
    ...(data.casing ? [`Revestimento: pressao interna max. ${n(data.casing.pressurePsi, 0)} psi a ${n(data.casing.md, 1)} m, ruptura ${n(data.casing.burstPsi, 0)} psi `
      + `(${data.casing.exceeded ? 'passa da ruptura' : `folga de ${n(data.casing.marginPsi, 0)} psi`}).`] : []),
    `Margens em psi / ppg de folga. Classes: atencao < ${n(data.classes.atencaoPpg, 2)}, alerta < ${n(data.classes.alertaPpg, 2)}, critico < ${n(data.classes.criticoPpg, 2)} ppg.`,
  ];
  return tableReportSvg('Janela operacional - ponto critico por etapa',
    ['Etapa', 'Margem fratura', 'MD fratura (m)', 'Margem poro', 'Situacao'], rows, notes);
}
