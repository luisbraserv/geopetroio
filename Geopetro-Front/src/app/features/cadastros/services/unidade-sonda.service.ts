import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { parseApiError } from '../../../core/http/api-error';
import { environment } from '../../../../environments/environment';
import { Pagina } from '../../../shared/models/pagina.model';
import { UnidadeSonda, UnidadeSondaPayload } from '../models/cadastros.model';

@Injectable({ providedIn: 'root' })
export class UnidadeSondaService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/api/unidades-sondas`;

  listar(setorId?: number | number[] | null): Observable<UnidadeSonda[]> {
    let params = new HttpParams();
    if (Array.isArray(setorId)) {
      setorId.filter(Boolean).forEach((id) => params = params.append('setorIds', String(id)));
    } else if (setorId) {
      params = params.set('setorId', String(setorId));
    }
    return this.http.get<UnidadeSonda[]>(this.apiUrl, { params }).pipe(catchError((error) => this.handleError(error)));
  }

  listarPaginado(pagina = 0, tamanho = 10, busca = ''): Observable<Pagina<UnidadeSonda>> {
    let params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    if (busca) params = params.set('busca', busca);
    return this.http
      .get<Pagina<UnidadeSonda>>(`${this.apiUrl}/paginado`, { params })
      .pipe(catchError((error) => this.handleError(error)));
  }

  buscarPorId(id: number): Observable<UnidadeSonda> {
    return this.http.get<UnidadeSonda>(`${this.apiUrl}/${id}`).pipe(catchError((error) => this.handleError(error)));
  }

  criar(payload: UnidadeSondaPayload): Observable<UnidadeSonda> {
    return this.http.post<UnidadeSonda>(this.apiUrl, payload).pipe(catchError((error) => this.handleError(error)));
  }

  atualizar(id: number, payload: UnidadeSondaPayload): Observable<UnidadeSonda> {
    return this.http.put<UnidadeSonda>(`${this.apiUrl}/${id}`, payload).pipe(catchError((error) => this.handleError(error)));
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(catchError((error) => this.handleError(error)));
  }

  private handleError(error: unknown): Observable<never> {
    return throwError(() => new Error(parseApiError(error)));
  }
}
