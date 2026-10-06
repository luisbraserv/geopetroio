import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

/**
 * O limite de uma grandeza — `specs/SDD/software/apis/configuracao-sonda.md §2`.
 *
 * ⚠️ **`serie` faz parte da identidade, não é rótulo.** As três séries de um card de stroke
 * compartilham o `dispositivoId` (RN-098): sem ela, o limite de vazão e o de volume acumulado
 * colidiriam, e um deles sumiria ao salvar.
 */
export interface LimiteAlarme {
  dispositivoId: string;
  /** `null` para card de uma grandeza só. */
  serie: string | null;
  minimoAtencao: number | null;
  maximoAtencao: number | null;
  minimoCritico: number | null;
  maximoCritico: number | null;
  /** Tempo mínimo fora da faixa para abrir ou escalar — RN-068. */
  segundosParaAbrir: number;
  /** Tempo mínimo dentro da faixa para reduzir ou fechar. É outro tempo, e de propósito. */
  segundosParaFechar: number;
  ativo: boolean;
}

export interface ConfiguracaoLimites {
  schemaVersion: number;
  unidadeId: number;
  /** `0` quando a unidade nunca teve limites gravados. */
  revisao: number;
  limites: LimiteAlarme[];
  atualizadoPor: string | null;
  atualizadoEm: string | null;
}

/**
 * Leitura e gravação dos limites de alarme de uma Unidade.
 *
 * **Quem enxerga a unidade ajusta, inclusive `CLIENTE`** ([RN-069]). É o oposto do documento de
 * cards, que só `ADMIN` ou `SUPORTE` gravam e só pelo Desktop — e é por isso que os dois são
 * documentos separados, com revisões próprias (RN-089).
 *
 * ⚠️ **A lista substitui a anterior por inteiro.** Não há PATCH: omitir um limite é apagá-lo, e
 * `[]` remove todos. O `PUT` exige a revisão lida; revisão desatualizada responde `409`, que é a
 * proteção contra dois ajustes simultâneos em que o último silenciosamente vence.
 */
@Injectable({ providedIn: 'root' })
export class LimitesAlarmeService {
  private readonly http = inject(HttpClient);
  private readonly unidadesUrl = `${environment.apiUrl}/api/monitoramento/unidades`;

  /**
   * Documento vigente.
   *
   * Unidade sem limites responde `200` com revisão `0` e lista vazia — não `404`. É estado normal:
   * unidade sem limite **não alarma**, e isso não é pendência sinalizada.
   */
  ler(unidadeId: number): Observable<ConfiguracaoLimites> {
    return this.http.get<ConfiguracaoLimites>(`${this.unidadesUrl}/${unidadeId}/configuracao`);
  }

  /** @param revisao a revisão lida; o servidor recusa com `409` se já tiver avançado */
  salvar(
    unidadeId: number,
    revisao: number,
    limites: readonly LimiteAlarme[],
  ): Observable<ConfiguracaoLimites> {
    return this.http.put<ConfiguracaoLimites>(
      `${this.unidadesUrl}/${unidadeId}/configuracao`,
      { revisao, limites },
    );
  }
}

/**
 * As mesmas regras que o servidor aplica, para o erro aparecer antes da ida ao servidor.
 *
 * ⚠️ **Isto não substitui a validação do servidor**, que continua sendo a autoridade — é o que
 * evita o usuário descobrir um limite invertido só depois de clicar em salvar.
 *
 * @returns a mensagem do primeiro problema, ou `null` se o limite é aceitável
 */
export function validarLimite(limite: LimiteAlarme): string | null {
  const valores = [
    limite.minimoAtencao,
    limite.maximoAtencao,
    limite.minimoCritico,
    limite.maximoCritico,
  ];
  const informados = valores.filter((valor): valor is number => valor !== null && valor !== undefined);

  if (informados.some((valor) => !Number.isFinite(valor))) {
    return 'Os limites devem ser números.';
  }
  if (limite.ativo && informados.length === 0) {
    return 'Informe ao menos um limite para ativar a vigilância desta grandeza.';
  }
  if (!Number.isInteger(limite.segundosParaAbrir) || limite.segundosParaAbrir < 0
    || !Number.isInteger(limite.segundosParaFechar) || limite.segundosParaFechar < 0) {
    return 'Os tempos devem ser inteiros de segundos, sem sinal negativo.';
  }
  // O critico fica FORA do de atencao: e ele que marca a excursao mais grave.
  if (maior(limite.minimoCritico, limite.minimoAtencao) || maior(limite.maximoAtencao, limite.maximoCritico)) {
    return 'Os limites críticos devem ficar fora dos de atenção.';
  }
  for (const minimo of [limite.minimoCritico, limite.minimoAtencao]) {
    for (const maximo of [limite.maximoAtencao, limite.maximoCritico]) {
      if (minimo !== null && maximo !== null && minimo >= maximo) {
        return 'Todo limite mínimo deve ser menor que todo limite máximo.';
      }
    }
  }
  return null;
}

function maior(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && a > b;
}
