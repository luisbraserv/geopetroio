import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface SondaDisponivel {
  /** Id numérico no cadastro — endereça o tópico de tempo real. Estável a renomeações. */
  id: number;
  /** Nome cadastrado (ex.: SPT-144) — chave de correlação do histórico no InfluxDB. */
  idSondaUnidade: string;
  nome: string;
  apelido: string;
}

export interface MonitoramentoPonto {
  dataHora: string;
  valor: number;
}

export interface MonitoramentoSerie {
  idSondaUnidade: string;
  dispositivoId: string;
  pontos: MonitoramentoPonto[];
}

@Injectable({ providedIn: 'root' })
export class MonitoramentoSondaService {
  private readonly http = inject(HttpClient);
  // Backend-Sonda (API principal): valida JWT/permissões do usuário e faz proxy da
  // consulta ao InfluxDB (via aplicação de telemetria). O front não fala direto com o
  // telemetria; sempre passa pelo backend para respeitar o vínculo do usuário às sondas.
  private readonly sondasUrl = `${environment.apiUrl}/api/sondas`;

  listarMinhas(): Observable<SondaDisponivel[]> {
    // Apenas as sondas vinculadas ao setor/empresa do usuário autenticado.
    return this.http.get<SondaDisponivel[]>(`${this.sondasUrl}/minhas`);
  }

  consultarSerie(
    idSondaUnidade: string,
    dispositivoId: string,
    inicio: string,
    fim: string
  ): Observable<MonitoramentoSerie> {
    const params = new HttpParams()
      .set('dispositivoId', dispositivoId)
      .set('inicio', inicio)
      .set('fim', fim);
    return this.http.get<MonitoramentoSerie>(
      `${this.sondasUrl}/${encodeURIComponent(idSondaUnidade)}/monitoramentos/series`,
      { params }
    );
  }
}
