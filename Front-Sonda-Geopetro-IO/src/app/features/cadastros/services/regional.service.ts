import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { parseApiError } from '../../../core/http/api-error';
import { environment } from '../../../../environments/environment';
import { Pagina } from '../../../shared/models/pagina.model';
import { Regional, RegionalPayload } from '../models/cadastros.model';

@Injectable({ providedIn: 'root' })
export class RegionalService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/api/regionais`;

  listar(): Observable<Regional[]> {
    return this.http.get<Regional[]>(this.apiUrl).pipe(catchError((error) => this.handleError(error)));
  }

  listarPaginado(pagina = 0, tamanho = 10, busca = ''): Observable<Pagina<Regional>> {
    let params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    if (busca) params = params.set('busca', busca);
    return this.http
      .get<Pagina<Regional>>(`${this.apiUrl}/paginado`, { params })
      .pipe(catchError((error) => this.handleError(error)));
  }

  buscarPorId(id: number): Observable<Regional> {
    return this.http.get<Regional>(`${this.apiUrl}/${id}`).pipe(catchError((error) => this.handleError(error)));
  }

  criar(payload: RegionalPayload): Observable<Regional> {
    return this.http.post<Regional>(this.apiUrl, payload).pipe(catchError((error) => this.handleError(error)));
  }

  atualizar(id: number, payload: RegionalPayload): Observable<Regional> {
    return this.http.put<Regional>(`${this.apiUrl}/${id}`, payload).pipe(catchError((error) => this.handleError(error)));
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(catchError((error) => this.handleError(error)));
  }

  private handleError(error: unknown): Observable<never> {
    return throwError(() => new Error(parseApiError(error)));
  }
}
