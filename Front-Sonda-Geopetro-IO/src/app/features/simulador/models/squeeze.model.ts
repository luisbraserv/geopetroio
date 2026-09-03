export interface Perfuracao {
  top: number;
  base: number;
}

export interface SqueezeInputs {
  sectionStartMD: number;
  sectionEndMD: number;
  sectionStartTVD: number;
  sectionEndTVD: number;
  wellFinalMD: number;
  wellFinalTVD: number;
  caliper: number;
  casingOD: number;
  casingID: number;
  tubingOD: number;
  tubingID: number;
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
  /** @deprecated não entra mais nos cálculos — a pressão aplicada é a pressão de operação, só na injeção. */
  surfacePressure?: number;
  /** @deprecated não entra mais nos cálculos. */
  squeezeTestPressure?: number;
  /** Pressão de operação (psi na superfície) aplicada na injeção/pressurização final. */
  pressaoOperacao?: number;
  /** Volume de pasta injetado para a formação (bbl) — alimenta expectedLoss da geometria. */
  volMaxInjetadoBbl?: number;
  /** Densidade alvo da pasta (ppg) — usada na hidrostática de fundo da injeção. */
  density?: number;
  expectedLoss?: number;
  /** Tempo de pressurização do squeeze no poço (min), após o deslocamento. */
  tempoPressurizacaoMin?: number;
  topoCanhoneadoMD?: number;
  baseCanhoneadoMD?: number;
  topoCanhoneadoTVD?: number;
  baseCanhoneadoTVD?: number;
  profundidadeReferenciaSqueezeMD?: number;
  profundidadeReferenciaSqueezeTVD?: number;
  pressaoSuperficiePsi?: number;
  gradientePoroPpg?: number;
  gradienteFraturaPpg?: number;
  densidadeFluidoCompletaçãoPpg?: number;
  densidadeFluidoDeslocamentoPpg?: number;
  densidadeAguaFrentePpg?: number;
  densidadeAguaAtrasPpg?: number;
  densidadePastaPpg?: number;
  volumePastaBbl?: number;
  volumeAguaFrenteBbl?: number;
  volumeAguaAtrasBbl?: number;
  volumeDeslocamentoBbl?: number;
  vazaoBpm?: number;
  /** Vazões por fluido (bpm) — quando ausentes, caem em vazaoBpm/pumpRate. */
  vazaoAguaFrenteBpm?: number;
  vazaoPastaBpm?: number;
  vazaoAguaAtrasBpm?: number;
  vazaoDeslocamentoBpm?: number;
  tempoPausaMin?: number;
  /** 'tampao' reutiliza a simulação hidráulica sem a fase de injeção/pressurização final. */
  modoOperacao?: 'squeeze' | 'tampao';

  // ── Configurações do motor de simulação (seção "Simulador") ──
  /** Estado do tubo: multiplica o fator de atrito em regime turbulento (low=novo/liso). */
  rugosidadeTubo?: 'low' | 'medium' | 'high';
  /** Viscosidade dos fluidos aquosos (água frente/atrás/deslocamento) em cP. Padrão 1. */
  viscosidadeAguaCp?: number;
  /** Limite da vazão de queda livre como múltiplo da vazão de bombeio. Padrão 3,5. */
  freeFallMaxFactor?: number;
  /**
   * Centralização da coluna no anular (standoff %): 100 = concêntrico,
   * 0 = totalmente excêntrico. Excentricidade reduz a fricção anular
   * (Petroguia F-40: pf/pfo = 1 − (0,44 + 0,18·n)·(1 − Sto/100)).
   */
  standoffPct?: number;

  // ── Limites do equipamento de bombeio (seção "Simulador") ──
  /** Potência do motor da unidade de bombeio (HP). */
  motorHP?: number;
  /** Eficiência da bomba (%). */
  pumpEff?: number;
  /** Pressão máxima de superfície suportada (psi). */
  maxSurfacePressure?: number;
  /** Vazão máxima da unidade (bpm). */
  maxPumpRate?: number;
}

export interface SqueezeGeometry {
  top: number;
  base: number;
  wellFinalMD: number;
  wellFinalTVD: number;
  len: number;
  perfs: Perfuracao[];
  deepestPerf: number;
  shallowestPerf: number;
  annulusOpen_m: number;
  annulusCasing_m: number;
  casingFull_m: number;
  finalCapacity_m: number;
  tubingID_m: number;
  annulusVolume: number;
  workVolumeBbl: number;
  cementHeightWithTubing: number;
  cementHeightWithoutTubing: number;
  topCementImmersedMD: number;
  topCementAfterPullMD: number;
  topCementImmersedAfterInjectionMD: number;
  topCementAfterInjectionMD: number;
  displacementVolume: number;
  expectedLoss: number;
  slurryTotal: number;
  slurryPumpedVolumeBbl: number;
  slurryInjectedVolumeBbl: number;
  slurryPhysicalVolumeBbl: number;
  cementPhysicalHeight: number;
  cementPhysicalTopMD: number;
  cementPhysicalBaseMD: number;
  cementPhysicalCapacityBblM: number;
  washVolFront: number;
  washFrontHeight: number;
  frontOperationalHeight: number;
  backOperationalHeight: number;
  frontPhysicalVolumeBbl: number;
  frontPhysicalHeight: number;
  volBackSpacer: number;
  backPhysicalVolumeBbl: number;
  backPhysicalHeight: number;
  displacementHydroBalance: null;
  operationalDisplacementVolumeBbl: number;
  oh: number;
  cOD: number;
  cID: number;
  tOD: number;
  tID: number;
}

export interface SqueezeHydraulicPoint {
  timeMin: number;
  phase: string;
  /** Volume acumulado que permanece no poço (debita o que foi injetado na formação). */
  pumpedVolumeBbl: number;
  /** Volume acumulado squeezado para a formação durante a injeção. */
  injectedVolumeBbl: number;
  programmedRateBpm: number;
  realRateBpm: number;
  freeFallExtraRateBpm: number;
  pumpPressurePsi: number;
  surfacePressurePsi: number;
  frictionPsi: number;
  /** Fricção do retorno pelo anular (F-40 c/ correção de standoff); 0 sem retorno. */
  annularFrictionPsi: number;
  hydrostaticPsi: number;
  bhpPsi: number;
  ecdPpg: number | null;
  porePsi: number;
  fracturePsi: number;
  freeFallAccumBbl: number;
  freeFallHeightM: number;
  drivePsi: number;
  hydraulicLossPsi: number;
}

export interface SqueezeHydraulicSummary {
  referenceMD: number;
  referenceTVD: number;
  topPerfMD: number;
  basePerfMD: number;
  topPerfTVD: number;
  basePerfTVD: number;
  porePsi: number;
  fracturePsi: number;
  bhpMaxPsi: number;
  bhpMinPsi: number;
  ecdMaxPpg: number | null;
  maxSurfacePressurePsi: number;
  marginToFracturePsi: number;
  marginAbovePorePsi: number;
  totalTimeMin: number;
  pauseTimeMin: number;
  freeFallAccumBbl: number;
  freeFallHeightM: number;
  operationalIndex: number;
  alert: 'below-pore' | 'above-fracture' | 'inside-window';
  // ── Limites do equipamento de bombeio ──
  /** HHP máximo exigido pelo job (pressão de bombeio × vazão ÷ 40,8). */
  hhpMaxRequired: number;
  /** HHP disponível = potência do motor × eficiência da bomba (null se não informado). */
  hhpAvailable: number | null;
  /** Uso da potência disponível em % (null se não informado). */
  hhpUsePct: number | null;
  /** Alertas de limites do equipamento excedidos. */
  equipmentAlerts: string[];
}

export interface SqueezeHydraulicSimulation {
  summary: SqueezeHydraulicSummary;
  points: SqueezeHydraulicPoint[];
  categories: string[];
}
