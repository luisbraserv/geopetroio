import type { PrimaryFluid } from './primary-cementing.model';

/**
 * Reologia de referência da primária: fluidos do exemplo de projeto do R3
 * (Nelson e Guillot, *Well Cementing*, §12-7, Tabela 12-5 — 9⅝" em 12¼" através
 * de sal), com a reologia de fundo Herschel-Bulkley do livro ajustada à lei de
 * potência por mínimos quadrados log-log entre 10 e 300 1/s. É o cenário de
 * campo MINA-28BD e o ponto de partida de um programa novo, no lugar de água
 * a 1 cP. Continua sendo estimativa: não substitui o ensaio do fluido do poço.
 */
export const PRIMARY_REFERENCE_RHEOLOGY = {
  /** Lama salgada 9,8 ppg; também o fluido de deslocamento. */
  mud: { n: 0.34819378846252647, kLbfSnFt2: 0.03601941870999526 },
  /** Lavador químico 9,6 ppg, newtoniano de 5 cP. */
  wash: { n: 1, kLbfSnFt2: 0.00010442717112286297 },
  /** Espaçador 11,0 ppg. */
  spacer: { n: 0.24834176807333225, kLbfSnFt2: 0.0775253276815654 },
  /** Pasta lead 11,5 ppg. */
  lead: { n: 0.44481821572860764, kLbfSnFt2: 0.05899515023102458 },
  /** Pasta tail 15,9 ppg; padrão de uma pasta nova. */
  tail: { n: 0.32996955025080715, kLbfSnFt2: 0.07965791409297873 },
} as const;

export const PRIMARY_REFERENCE_RHEOLOGY_SOURCE =
  'Padrão da primária: R3 §12-7, Tabela 12-5 (cenário MINA-28BD); lei de potência ajustada de 10 a 300 1/s';

/** Reologia inicial de um fluido novo, pelo tipo. */
export function primaryDefaultRheology(kind: PrimaryFluid['kind']): { n: number; kLbfSnFt2: number } {
  const reference = kind === 'mud' || kind === 'displacement' ? PRIMARY_REFERENCE_RHEOLOGY.mud
    : kind === 'wash' ? PRIMARY_REFERENCE_RHEOLOGY.wash
      : kind === 'spacer' ? PRIMARY_REFERENCE_RHEOLOGY.spacer
        : PRIMARY_REFERENCE_RHEOLOGY.tail;
  return { n: reference.n, kLbfSnFt2: reference.kLbfSnFt2 };
}
