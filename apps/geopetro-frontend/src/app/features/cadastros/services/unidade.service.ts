import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { parseApiError } from '../../../core/http/api-error';
import { environment } from '../../../../environments/environment';
import { Pagina } from '../../../shared/models/pagina.model';
import { StatusUnidade, Unidade, UnidadePayload } from '../models/cadastros.model';

@Injectable({ providedIn: 'root' })
export class UnidadeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/api/unidades`;

  listar(setorId?: number | number[] | null, status?: StatusUnidade | null): Observable<Unidade[]> {
    let params = new HttpParams();
    if (Array.isArray(setorId)) {
      setorId.filter(Boolean).forEach((id) => params = params.append('setorIds', String(id)));
    } else if (setorId) {
      params = params.set('setorId', String(setorId));
    }
    if (status) params = params.set('status', status);
    return this.http.get<Unidade[]>(this.apiUrl, { params }).pipe(catchError((error) => this.handleError(error)));
  }

  listarPaginado(pagina = 0, tamanho = 10, busca = '', status?: StatusUnidade | null): Observable<Pagina<Unidade>> {
    let params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    if (busca) params = params.set('busca', busca);
    if (status) params = params.set('status', status);
    return this.http
      .get<Pagina<Unidade>>(`${this.apiUrl}/paginado`, { params })
      .pipe(catchError((error) => this.handleError(error)));
  }

  buscarPorId(id: number): Observable<Unidade> {
    return this.http.get<Unidade>(`${this.apiUrl}/${id}`).pipe(catchError((error) => this.handleError(error)));
  }

  criar(payload: UnidadePayload): Observable<Unidade> {
    return this.http.post<Unidade>(this.apiUrl, payload).pipe(catchError((error) => this.handleError(error)));
  }

  atualizar(id: number, payload: UnidadePayload): Observable<Unidade> {
    return this.http.put<Unidade>(`${this.apiUrl}/${id}`, payload).pipe(catchError((error) => this.handleError(error)));
  }

  inativar(id: number): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${id}/inativar`, null).pipe(catchError((error) => this.handleError(error)));
  }

  ativar(id: number): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${id}/ativar`, null).pipe(catchError((error) => this.handleError(error)));
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(catchError((error) => this.handleError(error)));
  }

  private handleError(error: unknown): Observable<never> {
    return throwError(() => new Error(parseApiError(error)));
  }
}
