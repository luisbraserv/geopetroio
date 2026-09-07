export interface TampaoInputs {
  sectionStartMD: number;
  sectionEndMD: number;
  sectionStartTVD: number;
  sectionEndTVD: number;
  wellFinalMD: number;
  wellFinalTVD: number;
  holeID: number;
  pipeOD: number;
  pipeID: number;
  backSpacerHeight: number;
  mudWeightFront: number;
  mudWeightBack: number;
  /** Fluido de completação (ppg): preenche o poço (coluna e anular) antes/abaixo do trem bombeado. */
  completionWeight: number;
  /** Fluido de deslocamento (ppg): bombeado para deslocar o trem. Ausente, cai no fluido de completação. */
  displacementWeight?: number;
  fracGrad: number;
  poreGrad: number;
  pumpRate: number;
  surfaceTemp: number;
  geoGradient: number;
  hydroBalanceReference?: string;
  hydroBalanceManualMD?: number;
  hydroBalanceTolerancePsi?: number;
}

export interface PlugGeometry {
  hID: number;
  pOD: number;
  pID: number;
  pTop: number;
  pBase: number;
  pipeDep: number;
  sEnd: number;
  spH: number;
  wellFinalMD: number;
  wellFinalTVD: number;
  capAnn: number;
  capPipe: number;
  capHole: number;
  capFinal: number;
  plugHeight: number;
  lenAnnCement: number;
  volCementAnn: number;
  volCementPipe: number;
  volCementTotal: number;
  workVolumeBbl: number;
  cementHeightWithTubing: number;
  cementHeightWithoutTubing: number;
  volWashAnn: number;
  volWashTotal: number;
  volBackSpacer: number;
  volDisplacement: number;
  frontOperationalHeight: number;
  backOperationalHeight: number;
  frontPhysicalVolumeBbl: number;
  frontPhysicalHeight: number;
  cementPhysicalVolumeBbl: number;
  cementPhysicalCapacityBblM: number;
  cementPhysicalHeight: number;
  backPhysicalVolumeBbl: number;
  backPhysicalHeight: number;
  topCementInPipe: number;
  topWashInPipe: number;
  displacementHydroBalance: null;
  operationalDisplacementVolumeBbl: number;
  // Topos calculados corretamente por estado
  topCementWithTubing: number;
  topCementWithoutTubing: number;
  topBackSpacer: number;
  topFrontSpacer: number;
  topFrontNoTubing: number;
}

export interface PressurePoint {
  md: number;
  tvd: number;
  psiInside: number;
  psiOutside: number;
  fracPsi: number;
  porePsi: number;
  ecdInside: number;
  ecdOutside: number;
  bhpAnn: number;
  ecdPpg: number;
  freeFallPct: number;
}

export interface PressureProfile {
  points: PressurePoint[];
  fracGradPpg: number;
  poreGradPpg: number;
}

export interface BalanceResult {
  balanced: boolean;
  deltaPsi: number;
  insidePsi: number;
  outsidePsi: number;
  state: string;
}

export interface TampaoSimResult {
  plug: PlugGeometry;
  balance: BalanceResult;
  pressureProfile: PressureProfile;
  bhst: number;
  bhct: number;
  bhctFormula: string;
  sacks: number;
  pumpTime: number;
  ttRequired: number;
  hhp: number;
  hhpAvailable: number;
  hhpUsePct: number;
  pressureUsePct: number;
  rateUsePct: number;
}
