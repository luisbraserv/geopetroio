import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AlarmeAtivo } from './alarme-ativo';

/**
 * O que está alarmando agora numa Unidade/Sonda.
 *
 * ⚠️ **Não é a fonte principal.** A projeção acompanha cada ciclo do canal de tempo real, dentro da
 * própria mensagem de leituras — é assim que o destaque nunca descreve o ciclo anterior. Esta rota
 * cobre os dois momentos em que o canal não responde:
 *
 * - ao **abrir a tela**, antes da primeira mensagem;
 * - quando a sonda **não está publicando**. Um episódio aberto de uma sonda que caiu continua sendo
 *   verdade, e ficaria invisível justamente quando ninguém está olhando o CLP.
 *
 * Lista vazia é resposta normal: sonda dentro dos limites, ou sem limite configurado.
 */
@Injectable({ providedIn: 'root' })
export class AlarmesService {
  private readonly http = inject(HttpClient);
  private readonly sondasUrl = `${environment.apiUrl}/api/sondas`;

  ativos(unidadeSondaId: number): Observable<AlarmeAtivo[]> {
    return this.http.get<AlarmeAtivo[]>(`${this.sondasUrl}/${unidadeSondaId}/alarmes`);
  }
}
