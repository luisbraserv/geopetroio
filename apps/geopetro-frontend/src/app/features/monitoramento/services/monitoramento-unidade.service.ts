import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface UnidadeDisponivel {
  /** Id numérico no cadastro — endereça o tópico de tempo real. Estável a renomeações. */
  id: number;
  nome: string;
  apelido: string;
  tipo: string;
}

export interface MonitoramentoPonto {
  dataHora: string;
  valor: number;
}

export interface MonitoramentoSerie {
  idUnidade: string;
  dispositivoId: string;
  /**
   * Distingue as três grandezas de um card de stroke — RN-098. Ausente nas demais.
   *
   * Acompanha o eco do filtro: sem ela, duas séries do mesmo contador voltariam indistinguíveis
   * na resposta, e a tela não saberia qual gráfico é qual.
   */
  serie?: string | null;
  pontos: MonitoramentoPonto[];
}

@Injectable({ providedIn: 'root' })
export class MonitoramentoUnidadeService {
  private readonly http = inject(HttpClient);
  // Geopetro-Backend (API principal): valida JWT/permissões do usuário e faz proxy da
  // consulta ao InfluxDB (via aplicação de telemetria). O front não fala direto com o
  // telemetria; sempre passa pelo backend para respeitar o vínculo do usuário às unidades.
  private readonly unidadesUrl = `${environment.apiUrl}/api/monitoramento/unidades`;

  listarMinhas(): Observable<UnidadeDisponivel[]> {
    // Apenas as unidades ativas visíveis para o usuário autenticado.
    return this.http.get<UnidadeDisponivel[]>(`${this.unidadesUrl}/minhas`);
  }

  /**
   * Série histórica de uma grandeza.
   *
   * ⚠️ **`serie` não é opcional por conveniência.** Um card `CONTADOR_STROKE` grava três séries
   * sob o mesmo `dispositivoId` (RN-098); consultá-lo sem o filtro devolve as três misturadas na
   * mesma linha do tempo — um gráfico que parece válido e não é. Para os demais tipos o campo não
   * existe, e enviá-lo vazio filtraria por uma série que ninguém gravou.
   */
  consultarSerie(
    unidadeId: number,
    dispositivoId: string,
    inicio: string,
    fim: string,
    serie?: string | null
  ): Observable<MonitoramentoSerie> {
    let params = new HttpParams()
      .set('dispositivoId', dispositivoId)
      .set('inicio', inicio)
      .set('fim', fim);
    if (serie) {
      params = params.set('serie', serie);
    }
    return this.http.get<MonitoramentoSerie>(
      `${this.unidadesUrl}/${unidadeId}/series`,
      { params }
    );
  }
}
