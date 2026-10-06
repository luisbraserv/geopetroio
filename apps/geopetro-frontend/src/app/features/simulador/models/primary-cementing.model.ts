import type { SlurryInputs } from './pasta.model';
import type { WellGeometry } from './well-geometry.model';

/** Todos os comprimentos MD/TVD em m; diâmetros in; volumes bbl; tempo min. */
export type PrimaryFluidKind = 'mud' | 'wash' | 'spacer' | 'cement' | 'displacement';
export type PrimaryPhaseKind = 'pump' | 'pause' | 'tool-event' | 'plug-landed' | 'static';
export type PrimaryPathZone = 'internal' | 'casing-annulus';
export type PrimaryVolumeAxis = 'total-pumped' | 'cement-pumped';

export interface PrimaryPropertySource {
  source: 'measured' | 'estimated' | 'entered';
  reference?: string;
  measuredAt?: string;
  originalValue?: number;
  originalUnit?: string;
  temperatureC?: number;
  pressurePsi?: number;
}

export interface PrimaryFluid {
  id: string;
  kind: PrimaryFluidKind;
  name: string;
  densityPpg: number;
  rheology: { model: 'power-law'; n: number; kLbfSnFt2: number };
  propertySources: Partial<Record<'densityPpg' | 'n' | 'kLbfSnFt2', PrimaryPropertySource>>;
  /** Receita de entrada, nunca SlurryDesign (resultado calculado). */
  recipe?: SlurryInputs;
  recipeParameters?: { source: 'calculated' | 'manual'; yieldFt3: number | null;
    facGpc: number | null; famGpc: number | null };
  labCurves?: {
    kind: 'thickening' | 'uca'; source: PrimaryPropertySource;
    points: { timeMin: number; value: number }[];
  }[];
}

export interface PrimaryTubularSection {
  id: string;
  topMD: number;
  bottomMD: number;
  idIn: number;
  odIn: number;
}

export interface PrimaryTubularAssembly {
  id: string;
  name: string;
  /** `work-string`: coluna de trabalho de extremidade aberta (tampão, squeeze). */
  role: 'target-casing' | 'setting-string' | 'previous-casing' | 'work-string';
  sections: PrimaryTubularSection[];
}

/**
 * Na coluna de trabalho (`work-string`) a montagem-alvo é a própria coluna e a
 * extremidade aberta faz as vezes de sapata e de colar: `floatCollarMD === shoeMD`,
 * sem shoe track, sem plugues e sem válvula de retenção.
 */
export type PrimaryTarget = {
  casingAssemblyId: string;
  floatCollarMD: number;
  shoeMD: number;
} & (
  | { kind: 'conventional' }
  | { kind: 'liner'; linerTopMD: number; settingStringAssemblyId: string }
  | { kind: 'work-string' }
);

/** Parede externa explícita, sem duplicar o cadastro de fases do poço. */
export type PrimaryOuterBoundary = {
  id: string; topMD: number; bottomMD: number;
} & (
  | { kind: 'previous-casing'; assemblyId: string }
  | { kind: 'open-hole'; phaseId: string; diameter:
      | { source: 'nominal'; excessFraction: number }
      | { source: 'measured'; diameterIn: number } }
);

export interface PrimaryPathLeg {
  id: string;
  zone: PrimaryPathZone;
  assemblyId: string;
  topMD: number;
  bottomMD: number;
  direction: 'down' | 'up';
}

export interface PrimaryFlowPath {
  id: string;
  name: string;
  /** Ordem física do percurso cabeça → saída ativa → retorno. */
  legs: PrimaryPathLeg[];
}

export interface PrimaryDevice {
  id: string;
  name: string;
  /** `open-end`: saída da coluna de trabalho; não assenta plugue nem retém fluxo. */
  kind: 'float-collar' | 'stage-tool' | 'liner-hanger' | 'open-end';
  assemblyId: string;
  outletMD: number;
  seatMD: number;
  launchMD: number;
  /** Porta nos stage-tools; passagem interna no colar/hanger. */
  initialState: 'open' | 'closed';
}

/** Estado hidráulico explícito; o motor de eventos decidirá quando alterá-lo. */
export interface PrimaryDeviceConnectionState {
  deviceId: string;
  internalPassage: 'open' | 'closed';
  outlet: 'open' | 'closed';
}

export type PrimaryRetainedVolume = {
  id: string; assemblyId: string; zone: PrimaryPathZone;
} & (
  | { kind: 'shoe-track'; topMD: number; bottomMD: number }
  | { kind: 'accessory'; md: number; volumeBbl: number;
      /** Obrigatório se a montagem não desambiguar o lado de uma fronteira. */
      connectionSide?: 'shallower' | 'deeper' }
);

export interface CementPlacement {
  id: string; fluidId: string; topMD: number; bottomMD: number;
  retainedVolumeIds: string[];
  /** Reserva de mistura: aumenta material preparado, nunca pasta bombeada. */
  mixingReserveBbl?: number;
}

export type PrimaryPumpQuantity =
  | { source: 'entered'; volumeBbl: number }
  | { source: 'placement'; placementId: string; fraction: number }
  | { source: 'displacement'; deviceId: string; fraction: number }
  | { source: 'reserve-extra'; placementId: string; volumeBbl: number }
  /**
   * Colchão (lavador ou espaçador) calculado pelo simulador: o maior entre o volume que
   * dá o tempo de contato na vazão do passo, V = t·Q, e o que ocupa o comprimento anular
   * mínimo na capacidade da pasta de fundo do estágio, V = L·V_pasta/H_pasta. Com
   * `overrideBbl`, o volume informado substitui o calculado, e o critério fica guardado.
   */
  | { source: 'preflush'; contactTimeMin: number; annularLengthM: number; overrideBbl: number | null };

/**
 * Critérios de partida dos colchões. R3 (Nelson e Guillot), cap. 5, diretrizes de
 * remoção de lama, p. 189: o lavador deve dar pelo menos 8 min de contato na zona de
 * interesse, e o espaçador deve ocupar pelo menos 500 ft (152,4 m) de anular. O
 * espaçador sozinho também limpa (R3, Tabela 9-3, p. 301: 10 min de contato), por isso
 * ele leva os dois critérios. Os 8 min reproduzem os 40 bbl a 5 bpm do programa da
 * Halliburton do MINA-02; a prática de 10 min (apostila CEP 2009) é escolha do usuário.
 */
export const PREFLUSH_DEFAULTS = { contactTimeMin: 8, spacerAnnularLengthM: 152.4 } as const;

export function defaultPreflushQuantity(kind: PrimaryFluidKind): Extract<PrimaryPumpQuantity, { source: 'preflush' }> {
  return { source: 'preflush', contactTimeMin: PREFLUSH_DEFAULTS.contactTimeMin,
    annularLengthM: kind === 'spacer' ? PREFLUSH_DEFAULTS.spacerAnnularLengthM : 0, overrideBbl: null };
}

export type PrimaryPumpStep =
  | { id: string; kind: 'pump'; fluidId: string; rateBpm: number; quantity: PrimaryPumpQuantity }
  /**
   * Com `untilBalanced`, a pausa acaba quando o tubo em U para de drenar, e
   * `durationMin` vira o teto (tampão: drenagem até o equilíbrio).
   */
  | { id: string; kind: 'pause'; durationMin: number; untilBalanced?: boolean }
  | { id: string; kind: 'tool-event'; deviceId: string;
      action: 'launch-bottom' | 'launch-top' | 'launch-dart' | 'open-stage' | 'close-stage' };

export interface CementingStage {
  id: string; name: string; deviceId: string;
  outletMD: number; seatMD: number; targetTocMD: number;
  activePathId: string;
  placements: CementPlacement[];
  steps: PrimaryPumpStep[];
}

export interface PrimaryReference {
  id: string; name: string; md: number;
  zone: PrimaryPathZone;
  assemblyId: string;
}

/**
 * Condicao operacional das superficies molhadas. A reologia n/k continua sendo
 * propria de cada fluido; estes niveis apenas corrigem a perda calculada para a
 * condicao media do tubo e da parede do retorno.
 */
export type PrimaryFrictionLevel = 'low' | 'medium' | 'high';

/** Configuração da operação; a geometria compartilhada fica fora deste objeto. */
export interface PrimaryConfiguration {
  target: PrimaryTarget | null;
  assemblies: PrimaryTubularAssembly[];
  outerBoundaries: PrimaryOuterBoundary[];
  paths: PrimaryFlowPath[];
  devices: PrimaryDevice[];
  retainedVolumes: PrimaryRetainedVolume[];
  stages: CementingStage[];
  fluids: PrimaryFluid[];
  initialFluidId: string | null;
  headCondition: 'closed-head' | 'vented-free-surface';
  returnPressurePsi: number;
  /** Ausente em cenarios antigos; o motor assume `medium` para cada caminho. */
  frictionSettings?: {
    internal: PrimaryFrictionLevel;
    annular: PrimaryFrictionLevel;
  };
  pressureWindow: { topMD: number; bottomMD: number;
    /** Pontos do topo opcionais: cenarios antigos sem eles continuam constantes. */
    topPorePpg?: number | null; topFracturePpg?: number | null;
    porePpg: number | null; fracturePpg: number | null;
    /**
     * Formação exposta mesmo atrás de revestimento (canhoneados do squeeze). Sem ele,
     * a janela só vale no poço aberto. A primária não o usa.
     */
    exposed?: boolean }[];
  equipmentLimits: { maxPressurePsi: number | null; maxRateBpm: number | null;
    motorHp: number | null; efficiency: number | null };
}

export interface PrimaryFlowSegment {
  id: string; pathId: string; equipmentId: string;
  topMD: number; bottomMD: number; topTVD: number; bottomTVD: number;
  casingIDIn: number; casingODIn: number;
  outerBoundary: 'open-hole' | 'previous-casing';
  outerBoundaryId: string;
  outerDiameterIn: number;
  pipeCapacityBblM: number;
  annularCapacityBblM: number;
  /** Sem base nominal quando o diâmetro é medido. */
  nominalAnnularCapacityBblM: number | null;
}

/** Entrada do motor após validação; não é o formato persistido do formulário. */
export interface PrimaryInputs {
  geometry: WellGeometry;
  primary: PrimaryConfiguration & { target: PrimaryTarget; initialFluidId: string };
  references: PrimaryReference[];
}

export interface PrimaryEvent {
  timeMin: number; stageId: string; stepId: string | null; deviceId?: string;
  kind: 'bottom-plug-launched' | 'bottom-plug-opened' | 'top-plug-launched'
    | 'top-plug-landed' | 'interface-at-outlet' | 'interface-at-return' | 'outside-model'
    | 'dart-launched' | 'liner-wiper-released' | 'stage-opened' | 'stage-closed'
    | 'balance-reached';
  md: number; fluidId?: string;
}

export interface PrimaryHydraulicPoint {
  timeMin: number; stageId: string; stepId: string | null; phase: PrimaryPhaseKind;
  pumpedVolumeBbl: number; cementPumpedVolumeBbl: number;
  returnedVolumeBbl: number; cementReturnedBbl: number;
  activeOutletMD: number;
  pumpRateBpm: number; outletRateBpm: number | null; returnRateBpm: number | null;
  inletDensityPpg: number | null;
  requiredPumpPressurePsi: number | null; pumpPressurePsi: number | null;
  annularHydrostaticPsi: number | null; internalHydrostaticPsi: number | null;
  pipeFrictionPsi: number | null; annularFrictionPsi: number | null; localLossPsi: number | null;
  referenceId: string;
  bhpPsi: number | null; ecdPpg: number | null;
  porePsi: number | null; fracturePsi: number | null;
  voidVolumeBbl: number | null; uTubeDrivePsi: number | null;
  state: 'full' | 'free-fall' | 'plug-landed' | 'outside-model';
  references: { id: string; md: number; tvd: number;
    pressurePsi: number | null; ecdPpg: number | null;
    /** Só a coluna de fluidos acima do ponto, sem atrito nem pressão de superfície. */
    hydrostaticPsi: number | null }[];
}

export interface PrimaryFluidInventory {
  fluidId: string;
  initialBbl: number; pumpedBbl: number; internalBbl: number;
  annularBbl: number; returnedBbl: number;
  /** Retenção/isolamento já incluídos em internalBbl/annularBbl. */
  balanceErrorBbl: number;
}

export interface PrimarySnapshot {
  timeMin: number; stageId: string; activePathId: string;
  parcels: { fluidId: string; assemblyId: string; zone: PrimaryPathZone;
    topMD: number; bottomMD: number; volumeBbl: number;
    connectivity: 'circulating' | 'static-connected' | 'isolated' }[];
  devices: PrimaryDeviceConnectionState[];
  plugs: { id: string; deviceId: string; kind: 'bottom' | 'top' | 'dart' | 'liner-wiper';
    md: number | null; state: 'not-launched' | 'travelling' | 'landed-open' | 'landed-closed' }[];
  inventory: PrimaryFluidInventory[];
  profiles: { segmentId: string; zone: PrimaryPathZone; fluidId: string | null;
    md: number; tvd: number;
    densityPpg: number | null; pressurePsi: number | null; ecdPpg: number | null;
    porePpg: number | null; fracturePpg: number | null; reynolds: number | null;
    correlationId: string | null; correlationVersion: string | null;
    maxLaminarRe: number | null; minTurbulentRe: number | null }[];
}

export interface PrimaryDiagnostic {
  code: string; message: string;
  severity: 'error' | 'warning' | 'info';
  category: 'configuration' | 'outside-model' | 'operational-limit' | 'placement';
  stageId?: string; stepId?: string; timeMin?: number; endTimeMin?: number;
  md?: number; tvd?: number; value?: number; limit?: number;
}

export interface PrimaryResult {
  operation: 'primaria'; engineVersion: string; inputRevision: string;
  status: 'complete' | 'partial' | 'invalid';
  points: PrimaryHydraulicPoint[];
  snapshots: PrimarySnapshot[];
  events: PrimaryEvent[];
  diagnostics: PrimaryDiagnostic[];
  envelope: { md: number; tvd: number; porePsi: number | null; fracturePsi: number | null;
    minAnnularPsi: number | null; maxAnnularPsi: number | null;
    /** Menor pressao hidrostatica pura no anular, sem atrito, entre os instantes simulados. */
    minHydrostaticPsi?: number | null;
    /** Maior pressao hidrostatica pura no anular, sem atrito, entre os instantes simulados. */
    maxHydrostaticPsi?: number | null }[];
  placements: { stageId: string; placementId: string; plannedVolumeBbl: number;
    actualIntervals: { topMD: number; bottomMD: number }[]; returnedBbl: number }[];
}
