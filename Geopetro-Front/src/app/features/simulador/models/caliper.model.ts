export interface CaliperSample {
  /** Profundidade medida normalizada para metros. */
  md: number;
  /** Eixos da elipse do furo, normalizados para polegadas. */
  ehd1In: number;
  ehd2In: number;
  /** Volume integrado do furo informado pelo LAS, quando existir. */
  ihvM3?: number | null;
}

export interface WellCaliperProfile {
  fileName: string;
  importedAt: string;
  depthMnemonic: string;
  diameterMnemonics: [string, string];
  startMD: number;
  stopMD: number;
  sampleCount: number;
  calculatedHoleVolumeM3: number;
  reportedHoleVolumeM3: number | null;
  volumeDifferencePct: number | null;
  samples: CaliperSample[];
}

