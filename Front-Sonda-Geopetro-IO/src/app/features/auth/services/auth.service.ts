import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { parseApiError } from '../../../core/http/api-error';
import { AuthenticatedUser, UserRole } from '../models/user.model';

interface AuthResponse {
  token: string;
  username: string;
  nome: string;
  email: string;
  endereco: string | null;
  telefone: string;
  cep?: string | null;
  logradouro?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  numero?: string | null;
  complemento?: string | null;
  roles: UserRole[];
  regionalId?: number | null;
  regionalNome?: string | null;
}

export class AuthException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthException';
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  authenticate$(username: string, password: string): Observable<AuthenticatedUser> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/auth/login`, { username, password })
      .pipe(
        map((response) => ({
          ...response,
          // Fallback para INTERNO: a role base de qualquer funcionário, e a que menos
          // concede acesso. 'USER' não existe no enum do backend.
          role: response.roles[0] ?? 'INTERNO',
          roles: response.roles ?? [],
          regionalId: response.regionalId ?? null,
          regionalNome: response.regionalNome ?? null,
        })),
        catchError((error) => throwError(() => new AuthException(parseApiError(error)))),
      );
  }
}
