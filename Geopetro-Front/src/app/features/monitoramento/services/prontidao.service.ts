import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

/**
 * O estado de configuração de uma Unidade/Sonda.
 *
 * `revisaoCards` em `0` significa **nunca configurada** — a unidade não lê nada (RN-088) e é
 * exatamente o que esta consulta existe para encontrar.
 */
export interface ProntidaoDaUnidade {
  unidadeSondaId: number;
  nome: string;
  apelido: string | null;
  revisaoCards: number;
  /** O que a unidade lê de fato. */
  cardsAtivos: number;
  /** Inclui os desativados: card não se exclui, se desativa (RN-091). */
  cardsDeclarados: number;
  cardsAtualizadosPor: string | null;
  cardsAtualizadosEm: string | null;
  revisaoLimites: number;
  /** O que vigia de fato. */
  limitesAtivos: number;
  /** Inclui os que hibernam com o card desativado. */
  limitesDeclarados: number;
  limitesAtualizadosPor: string | null;
  limitesAtualizadosEm: string | null;
}

/**
 * Quais unidades da frota já foram configuradas — resolve `OQ-049`.
 *
 * "A migração terminou" era, até aqui, uma afirmação **sem como conferir**: a frota nasce vazia e
 * cada unidade fica muda até alguém configurá-la pela tela do Desktop.
 *
 * ⚠️ **Não responde se a unidade está publicando.** Configurada e muda são coisas diferentes: um CLP
 * desligado ou um cabo solto aparecem aqui como prontos. Quem responde "está chegando dado?" é o
 * tempo real.
 */
@Injectable({ providedIn: 'root' })
export class ProntidaoService {
  private readonly http = inject(HttpClient);

  daFrota(): Observable<ProntidaoDaUnidade[]> {
    return this.http.get<ProntidaoDaUnidade[]>(`${environment.apiUrl}/api/sondas/prontidao`);
  }
}

/** Em que estado a unidade está, para a tela agrupar e ordenar. */
export type EstadoProntidao = 'NUNCA_CONFIGURADA' | 'MUDA' | 'SEM_ALARME' | 'PRONTA';

/**
 * ⚠️ **Três formas de estar sem telemetria, e elas exigem ações diferentes.**
 *
 * - `NUNCA_CONFIGURADA` — ninguém esteve lá. É a unidade que a migração esqueceu.
 * - `MUDA` — alguém esteve lá e **todos os cards ficaram desativados**. A unidade não lê nada, mas o
 *   documento existe: é engano de configuração, não falta de visita.
 * - `SEM_ALARME` — lê e publica, e **nada a vigia**. Estado normal segundo a spec, e invisível de
 *   fora até esta tela existir.
 */
export function estadoDe(unidade: ProntidaoDaUnidade): EstadoProntidao {
  if (unidade.revisaoCards === 0) return 'NUNCA_CONFIGURADA';
  if (unidade.cardsAtivos === 0) return 'MUDA';
  if (unidade.limitesAtivos === 0) return 'SEM_ALARME';
  return 'PRONTA';
}

const ORDEM: Record<EstadoProntidao, number> = {
  NUNCA_CONFIGURADA: 0,
  MUDA: 1,
  SEM_ALARME: 2,
  PRONTA: 3,
};

/**
 * O que falta primeiro aparece primeiro.
 *
 * Uma lista em ordem alfabética esconderia a unidade esquecida entre trinta prontas — e encontrá-la
 * é a única razão de a tela existir.
 */
export function ordenarPorPendencia(unidades: readonly ProntidaoDaUnidade[]): ProntidaoDaUnidade[] {
  return [...unidades].sort((a, b) => {
    const pendencia = ORDEM[estadoDe(a)] - ORDEM[estadoDe(b)];
    return pendencia !== 0 ? pendencia : a.nome.localeCompare(b.nome);
  });
}
