import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { LimiteViolado, SeveridadeAlarme } from './alarme-ativo';

/** Vocabulário fechado em quatro fatos — RN-076. */
export type TipoFato = 'ABRIU' | 'ESCALOU' | 'REDUZIU' | 'FECHOU';

export interface FatoAlarme {
  tipo: TipoFato;
  severidade: SeveridadeAlarme;
  ocorridoEm: string;
  valor: number;
}

/**
 * Uma excursão inteira — a unidade do histórico.
 *
 * ⚠️ **Não é uma linha do log.** Um episódio que abriu em atenção, escalou e fechou são três fatos
 * e **uma** excursão; a resposta já vem agrupada para nenhuma tela ter de reconstruir isso e contar
 * a mesma excursão como três alarmes.
 *
 * @see specs/SDD/negocio/requisitos/alarmes.md §4
 */
export interface EpisodioAlarme {
  episodioId: string;
  unidadeId: number;
  dispositivoId: string;
  /** Qual das séries de um card de stroke (RN-098); `null` nos demais tipos. */
  serie: string | null;
  /** O pior que o episódio chegou a ser — não o que era ao fechar. */
  severidadeMaxima: SeveridadeAlarme;
  limiteViolado: LimiteViolado;
  abertoEm: string;
  /** `null` enquanto o episódio não fechou. */
  fechadoEm: string | null;
  valorExtremo: number | null;
  /** A sequência é a história: quando escalou e quando recuou não se deduz do resumo. */
  fatos: FatoAlarme[];
}

export interface PaginaHistorico {
  episodios: EpisodioAlarme[];
  /**
   * ⚠️ `true` significa que havia **mais** excursões do que o teto: a lista é a parte mais recente,
   * não o total. Estreitar o período é o caminho para ver o resto.
   */
  truncado: boolean;
}

/**
 * O histórico de alarmes de uma Unidade — "o que aconteceu?".
 *
 * É outra pergunta de "o que está alarmando agora?", que se responde por `AlarmesService`.
 *
 * ⚠️ **O período é obrigatório e tem teto no servidor.** O log é *append-only* e não tem política
 * de retenção: uma consulta sem limite funcionaria bem por meses e depois derrubaria a tela de uma
 * unidade movimentada, sem nada anunciando a mudança.
 */
@Injectable({ providedIn: 'root' })
export class HistoricoAlarmesService {
  private readonly http = inject(HttpClient);
  private readonly unidadesUrl = `${environment.apiUrl}/api/monitoramento/unidades`;

  consultar(unidadeId: number, inicio: string, fim: string): Observable<PaginaHistorico> {
    const params = new HttpParams().set('inicio', inicio).set('fim', fim);
    return this.http.get<PaginaHistorico>(
      `${this.unidadesUrl}/${unidadeId}/alarmes/historico`,
      { params },
    );
  }
}
