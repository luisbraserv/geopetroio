import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { parseApiError } from '../../../core/http/api-error';

export interface ServicoCliente {
  id: string;
  nome: string;
  escopos: string[];
  ativo: boolean;
  criadoEm: string;
  ultimoUsoEm: string | null;
}

export interface ServicoClientePayload {
  id: string;
  nome: string;
  escopos: string[];
}

export interface SegredoGerado {
  id: string;
  segredo: string;
  aviso: string;
}

@Injectable({ providedIn: 'root' })
export class ServicosClientesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/api/servicos-clientes`;

  listar(): Observable<ServicoCliente[]> {
    return this.http.get<ServicoCliente[]>(this.apiUrl).pipe(catchError((error) => this.falha(error)));
  }

  criar(payload: ServicoClientePayload): Observable<SegredoGerado> {
    return this.http.post<SegredoGerado>(this.apiUrl, payload).pipe(catchError((error) => this.falha(error)));
  }

  gerarNovoSegredo(id: string): Observable<SegredoGerado> {
    return this.http.post<SegredoGerado>(`${this.apiUrl}/${encodeURIComponent(id)}/segredo`, null)
      .pipe(catchError((error) => this.falha(error)));
  }

  ativar(id: string): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${encodeURIComponent(id)}/ativar`, null)
      .pipe(catchError((error) => this.falha(error)));
  }

  desativar(id: string): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${encodeURIComponent(id)}/desativar`, null)
      .pipe(catchError((error) => this.falha(error)));
  }

  private falha(error: unknown): Observable<never> {
    return throwError(() => new Error(parseApiError(error)));
  }
}
