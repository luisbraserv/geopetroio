import type { PrimaryDiagnostic, PrimaryHydraulicPoint, PrimaryResult, PrimarySnapshot } from './primary-cementing.model';
import type { PrimaryTransportSnapshot } from './primary-transport.model';

/** P6: hidráulica sobre as parcelas que P5 já posiciona. Completa os perfis. */
export type PrimaryFullSnapshot = PrimaryTransportSnapshot & Pick<PrimarySnapshot, 'profiles'>;

/** Balanço isolado das colunas e perdas; não depende de geometria nem de tempo. */
export interface PrimaryPressureBalanceInput {
  returnPressurePsi: number;
  internalHydrostaticPsi: number;
  annularHydrostaticPsi: number;
  pipeFrictionPsi: number;
  annularFrictionPsi: number;
  localLossPsi: number;
  /** TVD da saída ativa; zero ou ausente devolve ECD `null`. */
  outletTVD: number;
}

export interface PrimaryPressureBalance {
  /** Negativa indica tendência de queda livre; não é truncada em zero. */
  requiredPumpPressurePsi: number;
  bhpPsi: number;
  ecdPpg: number | null;
  /** `H_int − H_an − P_retorno`: o desbalanço que move o tubo em U. */
  uTubeDrivePsi: number;
}

export interface PrimaryLimitBreach {
  limit: 'pump-pressure' | 'pump-rate' | 'hydraulic-power' | 'pore' | 'fracture';
  startTimeMin: number;
  endTimeMin: number;
  peakValue: number;
  limitValue: number;
  stageId: string;
  stepId: string | null;
  md?: number;
  tvd?: number;
}

/**
 * Ponto de menor margem numa etapa (janela operacional §3.3): a pressão do poço contra a
 * fratura (margem = fratura − poço) ou contra o poro (margem = poço − poro), na malha exposta.
 */
export interface PrimaryCriticalSample {
  md: number; tvd: number; timeMin: number; pressurePsi: number;
  porePsi: number | null; fracturePsi: number | null; marginPsi: number;
}
export interface PrimaryCriticalStep {
  stageId: string; stepId: string | null;
  fracture: PrimaryCriticalSample | null; pore: PrimaryCriticalSample | null;
}

export interface PrimaryHydraulicsResult {
  points: PrimaryHydraulicPoint[];
  snapshots: PrimaryFullSnapshot[];
  envelope: PrimaryResult['envelope'];
  /** Limites excedidos com início, fim e pico; o programa não é limitado. */
  breaches: PrimaryLimitBreach[];
  /** Menor margem até a fratura, com onde e quando ocorreu. */
  narrowestFractureMargin: { psi: number; md: number; tvd: number; timeMin: number } | null;
  /** Menores margens até a fratura e sobre o poro em cada etapa, na ordem das etapas. */
  criticalByStep?: PrimaryCriticalStep[];
  hydraulicPowerUsagePct: number | null;
  diagnostics: PrimaryDiagnostic[];
  status: 'complete' | 'partial' | 'invalid';
}
