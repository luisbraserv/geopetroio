/**
 * Janela operacional do cenário (SPEC janela-operacional §3.1): poro e fratura pela TVD,
 * constantes ou por pontos, em EMW (ppg) ou em psi/ft, e as classes de margem.
 */
export type PressureGradientUnit = 'ppg' | 'psi/ft';
export type PressureProfileMode = 'constant' | 'table';

/** Um ponto da tabela, na unidade escolhida. */
export interface PressureProfilePoint { tvdM: number; pore: number; fracture: number }

export interface PressureProfileInput {
  unit: PressureGradientUnit;
  mode: PressureProfileMode;
  /** Valores do modo constante, na unidade escolhida. */
  pore: number;
  fracture: number;
  points: PressureProfilePoint[];
}

/** Limites das classes, em ppg de margem (a folga dividida por K · TVD). */
export interface MarginClasses { atencaoPpg: number; alertaPpg: number; criticoPpg: number }
export const DEFAULT_MARGIN_CLASSES: MarginClasses = { atencaoPpg: 1, alertaPpg: 0.5, criticoPpg: 0.25 };

export type MarginStatus = 'normal' | 'atencao' | 'alerta' | 'critico' | 'fratura' | 'influxo';
export const MARGIN_STATUS_LABELS: Record<MarginStatus, string> = {
  normal: 'Normal', atencao: 'Atenção', alerta: 'Alerta', critico: 'Crítico', fratura: 'Fratura', influxo: 'Influxo',
};
