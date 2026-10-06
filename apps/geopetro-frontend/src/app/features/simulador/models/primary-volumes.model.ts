import type { CementSlurryRecipeRow } from './pasta.model';
import type { PrimaryDiagnostic, PrimaryPropertySource } from './primary-cementing.model';

/**
 * P4: dimensionamento por intervalo, deslocamento pela rota e receitas.
 * Não transporta fluido nem calcula pressão — isso é P5/P6. O TOC aqui é o
 * ideal derivado do volume planejado, não a colocação medida pelo transporte.
 */
export interface PrimaryPlacementVolume {
  stageId: string;
  placementId: string;
  fluidId: string;
  topMD: number;
  bottomMD: number;
  /** Integral da capacidade anular efetiva no intervalo, sem volumes retidos. */
  annularBbl: number;
  /** Volumes retidos atribuídos a esta colocação, contados uma única vez. */
  retainedBbl: number;
  retainedVolumeIds: string[];
  /** Volume dimensionado por TOC e geometria: anular + retidos. */
  plannedBbl: number;
  /** Adição explícita ao programa, identificada como extra ao volume por TOC. */
  reserveExtraBbl: number;
  /** Reserva de mistura: aumenta material preparado, nunca pasta bombeada. */
  mixingReserveBbl: number;
  /** Soma dos passos desta colocação, incluindo a reserva extra bombeada. */
  programmedBbl: number;
  /** Material a preparar: bombeado programado + reserva de mistura. */
  preparedBbl: number;
  /** Frações dos passos de dimensionamento; deve fechar em 1. */
  fractionSum: number;
  stepIds: string[];
}

export interface PrimaryStepVolume {
  stageId: string;
  stepId: string;
  kind: 'pump' | 'pause' | 'tool-event';
  fluidId: string | null;
  /** Origem declarada da quantidade; preserva a rastreabilidade do programa. */
  source: 'placement' | 'displacement' | 'entered' | 'reserve-extra' | 'preflush' | null;
  placementId: string | null;
  /** Fração declarada do dimensionamento; null quando a quantidade é volume. */
  fraction: number | null;
  volumeBbl: number;
  rateBpm: number | null;
  durationMin: number;
  /** Colchão calculado: as duas parcelas do critério e qual delas governa. */
  preflush?: PrimaryPreflushBasis;
}

export interface PrimaryPreflushBasis {
  contactTimeMin: number;
  /** Vazão do passo, a do tempo de contato. */
  rateBpm: number;
  /** t·Q na vazão do passo. */
  contactBbl: number;
  annularLengthM: number;
  /** Capacidade anular da pasta de fundo do estágio (bbl/m), com caliper e excesso. */
  capacityBblM: number | null;
  placementId: string | null;
  /** L·capacidade. */
  annularBbl: number;
  calculatedBbl: number;
  governing: 'contact' | 'annular';
  /** Volume informado que substitui o calculado. */
  overrideBbl: number | null;
}

export interface PrimaryStageVolumes {
  stageId: string;
  targetTocMD: number;
  outletMD: number;
  placements: PrimaryPlacementVolume[];
  steps: PrimaryStepVolume[];
  /** Pasta dimensionada pelos intervalos do estágio. */
  cementPlannedBbl: number;
  /** Pasta que o programa realmente bombeia, incluindo reserva extra. */
  cementProgrammedBbl: number;
  /** Capacidade do caminho de lançamento até o assento, vinda da geometria. */
  displacementTargetBbl: number;
  displacementProgrammedBbl: number;
  displacementFractionSum: number;
  totalPumpedBbl: number;
  totalTimeMin: number;
  /** TOC ideal do cimento programado, medido a partir da saída ativa. */
  idealToc: PrimaryTocResolution | null;
}

export interface PrimaryTocResolution {
  /** Zero quando o cimento alcança a superfície; nunca negativo. */
  tocMD: number;
  /** Excedente acima da superfície, identificado como cimento retornado. */
  returnedBbl: number;
  /** Volume consumido no anular até o topo encontrado. */
  placedBbl: number;
  reachedSurface: boolean;
}

export interface PrimaryProgramVolumes {
  stages: PrimaryStageVolumes[];
  totalPumpedBbl: number;
  totalCementPlannedBbl: number;
  totalCementProgrammedBbl: number;
  totalTimeMin: number;
  /** null enquanto houver erro: dimensionamento parcial não é resultado. */
  valid: boolean;
  diagnostics: PrimaryDiagnostic[];
}

export interface PrimaryRecipeOverride {
  field: 'densityPpg' | 'n' | 'kLbfSnFt2';
  source: PrimaryPropertySource;
}

export interface PrimaryPlacementRecipe {
  stageId: string;
  placementId: string;
  fluidId: string;
  /** Volume que o programa bombeia; a receita escala pelo preparado. */
  pumpedBbl: number;
  preparedBbl: number;
  yieldFt3PerFt3Cement: number;
  /** Valor exato; arredondar para suprimento não altera o volume simulado. */
  sacks94lb: number;
  supplySacks94: number;
  mixWaterGal: number;
  parameterSource?: 'calculated' | 'manual';
  facGpc?: number;
  famGpc?: number;
  rows: CementSlurryRecipeRow[];
  /** Campos substituídos pelo usuário, preservados ao recalcular a receita. */
  overrides: PrimaryRecipeOverride[];
  error?: string;
}

export interface PrimaryRecipeTotalRow {
  productName: string;
  type: CementSlurryRecipeRow['type'];
  concentrationUnit: string;
  massLb: number;
  volumeGal: number;
  placementIds: string[];
}

export interface PrimaryRecipeResolution {
  placements: PrimaryPlacementRecipe[];
  /** Só produtos e unidades compatíveis são somados entre pastas. */
  totals: PrimaryRecipeTotalRow[];
  diagnostics: PrimaryDiagnostic[];
}
