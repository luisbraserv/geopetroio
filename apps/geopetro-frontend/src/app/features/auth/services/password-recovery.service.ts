import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PasswordRecoveryService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/auth/recuperacao-senha`;
  request(email: string) { return this.http.post<{ message: string }>(this.url, { email: email.trim() }); }
  confirm(token: string, novaSenha: string, confirmacaoSenha: string) {
    return this.http.post<void>(`${this.url}/confirmar`, { token, novaSenha, confirmacaoSenha });
  }
}
