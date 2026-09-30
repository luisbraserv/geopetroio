import type { PrimaryDiagnostic, PrimaryEvent, PrimaryFluidInventory, PrimarySnapshot } from './primary-cementing.model';

/**
 * P5: transporte de parcelas pelo circuito resolvido em P3, com o programa
 * dimensionado em P4. A colocação daqui vem das parcelas efetivamente
 * transportadas, e substitui o TOC ideal de P4 sempre que a ordem bombeada
 * diverge da intenção. Com um modelo de vazão (§7.5), a coluna pode descer mais
 * rápido que o bombeio e abrir vazio no topo do interno: a queda livre.
 */
export interface PrimaryParcel {
  fluidId: string;
  volumeBbl: number;
}

/**
 * Estado do escoamento num instante: circuito cheio bombeando, parado, em queda
 * livre (saída ≠ bombeio, com ou sem vazio), plugue assentado ou fora do modelo.
 */
export type PrimaryFlowRegimeState = 'full' | 'static' | 'free-fall' | 'landed' | 'outside-model';

/** O que o modelo de vazão decide: a vazão na saída ativa, ou por que não há solução. */
export type PrimaryRateDecision =
  | { regime: Exclude<PrimaryFlowRegimeState, 'outside-model'>; outletRateBpm: number }
  | { regime: 'outside-model'; reason: string; message: string };

export interface PrimaryRateModelState {
  /** Só líquido; o vazio não é parcela. */
  parcels: PrimarySnapshot['parcels'];
  voidBbl: number;
  pumpRateBpm: number;
  /** Plugue do estágio assentado ou rota fechada: nada atravessa a saída. */
  sealed: boolean;
  outletMD: number;
  stageId: string;
}

export type PrimaryRateModel = (state: PrimaryRateModelState) => PrimaryRateDecision;

export interface PrimaryTransportOptions {
  /**
   * Sem modelo, o circuito é sempre cheio e a saída acompanha o bombeio, como em
   * P5. Com ele, a vazão de saída vem do balanço de pressão (queda livre, §7.5).
   */
  rateModel?: PrimaryRateModel;
  /** Maior volume movido entre duas amostras; o padrão acompanha o tamanho do circuito. */
  maxAdvanceBbl?: number;
}

/** Sem `profiles`: perfis de pressão/ECD pertencem a P6 e não são inventados aqui. */
export type PrimaryTransportSnapshot = Omit<PrimarySnapshot, 'profiles'> & {
  /**
   * Motivo da amostra; garante que evento e instante não sejam interpolados.
   * `pre-event` é o estado dinâmico no instante em que o plugue chega, antes de
   * fechar a passagem; `sample` é a amostra regular entre eventos.
   */
  reason: 'start' | 'step-start' | 'step-end' | 'event' | 'pre-event' | 'sample' | 'end';
  stepId: string | null;
  /** Vazão na cabeça neste instante; zero em pausa e após o assentamento. */
  pumpRateBpm: number;
  /** Saída ativa do circuito; null quando nenhum caminho está aberto. */
  activeOutletMD: number | null;
  /** Volume vazio no topo do interno (queda livre); zero com circuito cheio. */
  voidBbl?: number;
  /** Intervalos MD ocupados pelo vazio. */
  voids?: { topMD: number; bottomMD: number; volumeBbl: number }[];
  /** Vazão na saída ativa, igual à de retorno com o anular cheio; null fora do modelo. */
  outletRateBpm?: number | null;
  /** Ausente em transporte sem modelo de vazão: a hidráulica decide pelo balanço. */
  flowRegime?: PrimaryFlowRegimeState;
  outsideModelCode?: string;
  /** Acumulado bombeado na cabeça até este instante. */
  pumpedBbl?: number;
};

export interface PrimaryPlacementOutcome {
  stageId: string;
  placementId: string;
  fluidId: string;
  plannedVolumeBbl: number;
  programmedVolumeBbl: number;
  /** Intervalos anulares realmente ocupados pelo fluido ao fim do programa. */
  actualIntervals: { topMD: number; bottomMD: number }[];
  returnedBbl: number;
  /** Mais de um intervalo: bolsões, não bainha contínua. */
  fragmented: boolean;
  /** Topo efetivo da parcela mais rasa; null se o fluido não ficou no anular. */
  actualTocMD: number | null;
}

export interface PrimaryTransportResult {
  snapshots: PrimaryTransportSnapshot[];
  events: PrimaryEvent[];
  placements: PrimaryPlacementOutcome[];
  /** Inventário final por fluido, com o residual do balanço por fluido. */
  inventory: PrimaryFluidInventory[];
  diagnostics: PrimaryDiagnostic[];
  totalTimeMin: number;
  totalPumpedBbl: number;
  /** `partial` quando o programa roda mas diverge; `invalid` quando não roda. */
  status: 'complete' | 'partial' | 'invalid';
  /** Parou no primeiro estado fora do modelo: o restante do programa não foi simulado. */
  halted?: boolean;
}
