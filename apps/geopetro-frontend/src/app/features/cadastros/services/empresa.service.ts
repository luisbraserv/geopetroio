import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { parseApiError } from '../../../core/http/api-error';
import { environment } from '../../../../environments/environment';
import { Pagina } from '../../../shared/models/pagina.model';
import { Empresa, EmpresaPayload } from '../models/cadastros.model';

@Injectable({ providedIn: 'root' })
export class EmpresaService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/api/empresas`;

  listar(): Observable<Empresa[]> {
    return this.http.get<Empresa[]>(this.apiUrl).pipe(catchError((error) => this.handleError(error)));
  }

  listarPaginado(pagina = 0, tamanho = 10, busca = ''): Observable<Pagina<Empresa>> {
    let params = new HttpParams().set('pagina', pagina).set('tamanho', tamanho);
    if (busca) params = params.set('busca', busca);
    return this.http
      .get<Pagina<Empresa>>(`${this.apiUrl}/paginado`, { params })
      .pipe(catchError((error) => this.handleError(error)));
  }

  buscarPorId(id: number): Observable<Empresa> {
    return this.http.get<Empresa>(`${this.apiUrl}/${id}`).pipe(catchError((error) => this.handleError(error)));
  }

  criar(payload: EmpresaPayload): Observable<Empresa> {
    return this.http.post<Empresa>(this.apiUrl, payload).pipe(catchError((error) => this.handleError(error)));
  }

  atualizar(id: number, payload: EmpresaPayload): Observable<Empresa> {
    return this.http.put<Empresa>(`${this.apiUrl}/${id}`, payload).pipe(catchError((error) => this.handleError(error)));
  }

  excluir(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(catchError((error) => this.handleError(error)));
  }

  private handleError(error: unknown): Observable<never> {
    return throwError(() => new Error(parseApiError(error)));
  }
}
