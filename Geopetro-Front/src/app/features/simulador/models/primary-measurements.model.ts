/** Dados normalizados; importar CSV e comparar curvas são entregas posteriores. */
export const PRIMARY_MEASUREMENT_SCHEMA_VERSION = 1 as const;

type ChannelQuantity =
  | { quantity: 'pump-rate' | 'return-rate'; unit: 'bpm' }
  | { quantity: 'pressure'; unit: 'psi' }
  | { quantity: 'inlet-density' | 'local-density' | 'ecd'; unit: 'ppg' }
  | { quantity: 'total-pumped-volume' | 'cement-pumped-volume'; unit: 'bbl';
      volumeSource: 'measured-counter' | 'integrated-measured-rate' };

export type PrimaryMeasurementChannel = ChannelQuantity & {
  id: string;
  name: string;
  location: string;
  referenceMD?: number;
  /** Pressão normalizada é sempre manométrica; datum documenta sua referência. */
  datum?: string;
};

export interface PrimaryMeasuredDataset {
  id: string;
  schemaVersion: typeof PRIMARY_MEASUREMENT_SCHEMA_VERSION;
  name: string;
  importedAt: string;
  sourceFileName: string;
  mapping: Record<string, { column: string; originalUnit: string }>;
  alignment: { originTimestamp?: string; timezone?: string; offsetMin: number };
  maxInterpolationGapMin: number;
  channels: PrimaryMeasurementChannel[];
  samples: {
    sourceRow: number;
    /** Relativo à origem, ANTES do offset. Ordem e tempos repetidos preservados. */
    timeMin: number;
    md?: number;
    values: Record<string, number | null>;
  }[];
  importDiagnostics: {
    sourceRow: number; field: string; rawValue: string; reason: string;
    resolution: 'discarded-row' | 'missing-value' | 'corrected-mapping';
  }[];
}
