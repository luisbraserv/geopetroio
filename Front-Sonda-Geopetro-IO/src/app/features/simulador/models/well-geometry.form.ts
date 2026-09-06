import { WellGeometry, WellPhase, WellPhaseType } from './well-geometry.model';
import { phaseTvdAtMD } from '../services/well-geometry.service';

/**
 * Ponte entre o formulário (controles planos, fáceis de persistir) e o modelo
 * `WellGeometry`. Só faz mapeamento — nenhuma regra de geometria mora aqui;
 * elas ficam todas no `WellGeometryService`.
 */
export interface WellPhaseFormValue {
  id: string;
  name: string;
  type: WellPhaseType;
  topMD: number | null;
  bottomMD: number | null;
  topTVD: number | null;
  bottomTVD: number | null;
  holeDiameterIn: number | null;
  casingOD: number | null;
  casingID: number | null;
  shoeMD: number | null;
  shoeTVD: number | null;
}

const provided = (value: unknown): boolean => value != null && value !== '';

/** Ausência não vira zero: NaN é rejeitado pelo validador, sem alterar o formulário. */
export const geometryNumber = (value: unknown): number => {
  if (!provided(value) || (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim())) return Number.NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
};

const num = (value: unknown, fallback = 0): number => {
  const n = geometryNumber(value);
  return Number.isFinite(n) ? n : fallback;
};

export function phaseFormToWellPhase(row: WellPhaseFormValue, index: number): WellPhase {
  const topMD = geometryNumber(row.topMD);
  const bottomMD = geometryNumber(row.bottomMD);
  const hasCasing = provided(row.casingOD) || provided(row.casingID);
  const hasShoe = provided(row.shoeMD) || provided(row.shoeTVD);
  const shoeMD = geometryNumber(row.shoeMD);

  return {
    id: row.id || `phase-${index + 1}`,
    name: row.name?.trim() || `Fase ${index + 1}`,
    type: row.type || 'INTERMEDIATE',
    topMD,
    bottomMD,
    topTVD: geometryNumber(row.topTVD),
    bottomTVD: geometryNumber(row.bottomTVD),
    holeDiameterIn: geometryNumber(row.holeDiameterIn),
    // Dados parciais permanecem no modelo para que a validação mostre o erro.
    casing: hasCasing ? { odIn: geometryNumber(row.casingOD), idIn: geometryNumber(row.casingID), bottomMD: hasShoe ? shoeMD : bottomMD } : undefined,
    shoe: hasShoe ? { md: shoeMD, tvd: geometryNumber(row.shoeTVD) } : undefined,
  };
}

export function buildWellGeometry(finalMD: unknown, finalTVD: unknown, rows: WellPhaseFormValue[]): WellGeometry {
  return {
    finalMD: geometryNumber(finalMD),
    finalTVD: geometryNumber(finalTVD),
    phases: (rows ?? []).map(phaseFormToWellPhase),
  };
}

export function wellPhaseToForm(phase: WellPhase): WellPhaseFormValue {
  return {
    id: phase.id,
    name: phase.name,
    type: phase.type,
    topMD: phase.topMD,
    bottomMD: phase.bottomMD,
    topTVD: phase.topTVD,
    bottomTVD: phase.bottomTVD,
    holeDiameterIn: phase.holeDiameterIn,
    casingOD: phase.casing?.odIn ?? null,
    casingID: phase.casing?.idIn ?? null,
    shoeMD: phase.shoe?.md ?? phase.casing?.bottomMD ?? null,
    shoeTVD: phase.shoe?.tvd ?? (phase.casing ? phaseTvdAtMD(phase, phase.casing.bottomMD) : null),
  };
}

export function wellGeometryToForms(geometry: WellGeometry): WellPhaseFormValue[] {
  return geometry.phases.map(wellPhaseToForm);
}

/** Linha em branco para "+ Adicionar fase", encadeada abaixo da anterior. */
export function emptyPhaseForm(index: number, previous?: WellPhaseFormValue): WellPhaseFormValue {
  const top = num(previous?.bottomMD);
  const topTVD = num(previous?.bottomTVD, top);
  return {
    id: `phase-${Date.now()}-${index}`,
    name: `Fase ${index + 1}`,
    type: 'INTERMEDIATE',
    topMD: top,
    bottomMD: top + 100,
    topTVD,
    bottomTVD: topTVD + 100,
    holeDiameterIn: previous?.holeDiameterIn ?? 8.5,
    casingOD: null,
    casingID: null,
    shoeMD: null,
    shoeTVD: null,
  };
}
