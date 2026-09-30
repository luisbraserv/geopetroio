/**
 * Estrutura física do poço — fonte da verdade da geometria.
 *
 * Regra arquitetural: a operação (tampão/squeeze) NÃO define a geometria.
 * Ela é posicionada dentro dela por um `OperationInterval`. Toda pergunta
 * sobre fase, revestimento, diâmetro ou conversão MD↔TVD passa pelo
 * `WellGeometryService` — nenhum service de cálculo ou componente de desenho
 * pode reimplementar essa lógica.
 */

export type WellPhaseType =
  | 'CONDUCTOR'
  | 'SURFACE'
  | 'INTERMEDIATE'
  | 'PRODUCTION'
  | 'OPEN_HOLE';

export interface WellPhaseCasing {
  odIn: number;
  idIn: number;
  /** Topo do revestimento (MD). Ausente = desce da superfície. */
  topMD?: number;
  /** Base do revestimento (MD) — a sapata. */
  bottomMD: number;
}

export interface WellPhaseShoe {
  md: number;
  tvd: number;
}

export interface WellPhase {
  id: string;
  name: string;

  topMD: number;
  bottomMD: number;

  topTVD: number;
  bottomTVD: number;

  holeDiameterIn: number;

  casing?: WellPhaseCasing;
  shoe?: WellPhaseShoe;

  type: WellPhaseType;
  /** Survey digitado para esta fase; a primária monta a trajetória cumulativa. */
  survey?: WellTrajectory;
}

export interface WellGeometry {
  trajectory?: WellTrajectory;
  caliper?: import('./caliper.model').WellCaliperProfile | null;
  finalMD: number;
  finalTVD: number;
  phases: WellPhase[];
}

export interface SurveyStation {
  md: number;
  inclinationDeg: number;
  azimuthDeg: number;
}

export interface WellTrajectory {
  stations: SurveyStation[];
}

/** Intervalo da operação — independente da estrutura do poço. */
export interface OperationInterval {
  topMD: number;
  bottomMD: number;
}

export interface PerforationInterval {
  id: string;
  topMD: number;
  bottomMD: number;
}

/**
 * Trecho de geometria homogênea: entre duas mudanças (troca de fase, topo ou
 * sapata de revestimento) o diâmetro interno não muda, então a capacidade
 * bbl/m é constante dentro do segmento.
 */
export interface GeometrySegment {
  topMD: number;
  bottomMD: number;
  lengthMD: number;

  topTVD: number;
  bottomTVD: number;

  phaseId: string;
  phaseName: string;
  phaseType: WellPhaseType;

  holeDiameterIn: number;
  casingIdIn?: number;
  casingOdIn?: number;

  /** true quando o trecho é revestido. */
  cased: boolean;
  /** Diâmetro interno efetivo: ID do revestimento se revestido, senão o poço aberto. */
  innerDiameterIn: number;
}

/** Overlay desenhado sobre o poço — resultado calculado, nunca estrutura. */
export type WellOverlayType =
  | 'CEMENT'
  | 'SPACER'
  | 'DISPLACEMENT'
  | 'PERFORATION'
  | 'SQUEEZE'
  | 'TUBING';

export interface WellOverlay {
  type: WellOverlayType;
  topMD: number;
  bottomMD: number;
  label: string;
  /**
   * Onde o overlay vive: dentro da coluna, no anular, ocupando o poço todo, ou
   * no anular do revestimento-alvo da primária. `casing-annulus` mantém a
   * semântica de `annulus` e acrescenta limites radiais próprios.
   */
  zone?: 'tubing' | 'annulus' | 'full' | 'casing-annulus';
  /** Parede externa do fluido (furo ou ID anterior), em polegadas. */
  outerDiameterIn?: number;
  /** OD do revestimento-alvo: o aço que a bainha envolve. */
  innerDiameterIn?: number;
  sub?: string;
  color?: string;
}

export type WellGeometryIssueLevel = 'error' | 'warning';

export interface WellGeometryIssue {
  level: WellGeometryIssueLevel;
  code: string;
  message: string;
  phaseId?: string;
  /** Índice do item (fase/canhoneado) que originou o problema, quando aplicável. */
  index?: number;
}

/** Campos legados de seção única — só existem para a migração. */
export interface LegacySectionFields {
  sectionStartMD: number;
  sectionEndMD: number;
  sectionStartTVD: number;
  sectionEndTVD: number;
  wellFinalMD: number;
  wellFinalTVD: number;
  /** Diâmetro do poço/caliper da seção. */
  holeDiameterIn?: number;
  casingOD?: number;
  casingID?: number;
}
