import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { parseApiError } from '../../../core/http/api-error';
import { environment } from '../../../../environments/environment';
import {
  AtualizarUsuarioPayload,
  AlterarSenhaPayload,
  CriarUsuarioClientePayload,
  CriarUsuarioInternoPayload,
  UsuarioContatoPayload,
  UsuarioPaginadoResponse,
  UsuarioResponse,
} from '../models/usuario-api.model';

export class UsuariosException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsuariosException';
  }
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  listar(pagina = 0, tamanho = 20, busca = ''): Observable<UsuarioPaginadoResponse> {
    const params: Record<string, string | number> = { pagina, tamanho };
    if (busca) params['busca'] = busca;
    return this.http
      .get<UsuarioPaginadoResponse>(`${this.apiUrl}/usuarios`, { params })
      .pipe(catchError((error) => this.handleError(error)));
  }

  criarCliente(payload: CriarUsuarioClientePayload): Observable<UsuarioResponse> {
    return this.http
      .post<UsuarioResponse>(`${this.apiUrl}/usuarios/clientes`, payload)
      .pipe(catchError((error) => this.handleError(error)));
  }

  criarInterno(payload: CriarUsuarioInternoPayload): Observable<UsuarioResponse> {
    return this.http
      .post<UsuarioResponse>(`${this.apiUrl}/usuarios/internos`, payload)
      .pipe(catchError((error) => this.handleError(error)));
  }

  atualizarUsuario(username: string, payload: AtualizarUsuarioPayload): Observable<UsuarioResponse> {
    return this.http
      .patch<UsuarioResponse>(`${this.apiUrl}/usuarios/${encodeURIComponent(username)}`, payload)
      .pipe(catchError((error) => this.handleError(error)));
  }

  atualizarMeuUsuario(payload: UsuarioContatoPayload): Observable<UsuarioResponse> {
    return this.http
      .patch<UsuarioResponse>(`${this.apiUrl}/usuarios/me`, payload)
      .pipe(catchError((error) => this.handleError(error)));
  }

  alterarMinhaSenha(payload: AlterarSenhaPayload): Observable<UsuarioResponse> {
    return this.http
      .patch<UsuarioResponse>(`${this.apiUrl}/usuarios/me/senha`, payload)
      .pipe(catchError((error) => this.handleError(error)));
  }

  private handleError(error: unknown): Observable<never> {
    return throwError(() => new UsuariosException(parseApiError(error)));
  }
}
