/** DTO de apresentação independente do motor, sem canhoneados ou tubing fictícios. */
export type HydraulicOperation = 'squeeze' | 'tampao' | 'primaria';
export interface OperationHydraulicPoint {
  timeMin: number;
  phase: string;
  stageId: string | null;
  stepId: string | null;
  referenceId: string;
  totalPumpedVolumeBbl: number | null;
  cementPumpedVolumeBbl: number | null;
  returnedVolumeBbl: number | null;
  /** Grandeza legada do squeeze, não acumulado de entrada. */
  legacyWellVolumeBbl: number | null;
  injectedFormationVolumeBbl: number | null;
  pumpRateBpm: number;
  outletRateBpm: number | null;
  returnRateBpm: number | null;
  pumpPressurePsi: number | null;
  internalHydrostaticPsi: number | null;
  annularHydrostaticPsi: number | null;
  internalFrictionPsi: number | null;
  annularFrictionPsi: number | null;
  bhpPsi: number | null;
  ecdPpg: number | null;
  porePsi: number | null;
  fracturePsi: number | null;
  uTubeDrivePsi: number | null;
  /** Queda livre: `null` enquanto o modelo não resolve o estado, nunca Q bomba. */
  freeFallExtraRateBpm: number | null;
  hydraulicLossPsi: number | null;
  freeFallAccumBbl: number | null;
  voidVolumeBbl: number | null;
  /** `full` | `free-fall` | `plug-landed` | `outside-model`, quando o motor informa. */
  state: string | null;
}
export interface OperationHydraulicCharts {
  operation: HydraulicOperation;
  source: 'calculated';
  model: 'legacy-squeeze' | 'primary';
  /** Nome e TVD da referência física das séries; sem isso não há gradiente equivalente. */
  referenceLabel: string;
  referenceTVD: number | null;
  bottomMD: number | null;
  porePsiAtReference: number | null;
  fracturePsiAtReference: number | null;
  points: OperationHydraulicPoint[];
  envelope: { md: number; tvd: number; porePsi: number | null; fracturePsi: number | null;
    minAnnularPsi: number | null; maxAnnularPsi: number | null }[];
}
