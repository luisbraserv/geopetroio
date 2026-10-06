import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ConfiguracaoCards } from './grandezas-de-card';

/**
 * Leitura do documento de cards de uma Unidade/Sonda.
 *
 * Contrato em `specs/SDD/software/apis/configuracao-sonda.md §5`. **Somente leitura, de propósito:** os
 * cards são configurados no Geopetro-Desktop, presencialmente, porque acertar byte e rack exige
 * estar na unidade ([RN-086](../../../../../../specs/SDD/negocio/regras/business-rules.md)). O Front só lê — e é a
 * leitura que permite montar as telas a partir do que cada unidade declara medir.
 *
 * ⚠️ **A rota é endereçada pelo id numérico**, não pelo nome da sonda. `/api/sondas/{id}/cards`
 * usa o id do cadastro; já as séries do histórico usam `UnidadeSonda.nome` como chave de
 * correlação no InfluxDB (RN-018). `SondaDisponivel` traz os dois, e trocá-los devolve 403.
 */
@Injectable({ providedIn: 'root' })
export class CardsUnidadeService {
  private readonly http = inject(HttpClient);
  private readonly sondasUrl = `${environment.apiUrl}/api/sondas`;

  /**
   * Documento vigente da unidade.
   *
   * Unidade nunca configurada responde `200` com revisão `0` e lista vazia — não `404`. É estado
   * normal: a frota nasce vazia e cada unidade é configurada na visita (RN-088).
   */
  ler(unidadeSondaId: number): Observable<ConfiguracaoCards> {
    return this.http.get<ConfiguracaoCards>(`${this.sondasUrl}/${unidadeSondaId}/cards`);
  }
}
