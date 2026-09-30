import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface EmailSettings {
  enabled: boolean;
  host: string;
  port: number;
  transport: 'STARTTLS' | 'TLS' | 'NONE';
  auth: boolean;
  username: string;
  passwordConfigured: boolean;
  from: string;
  frontendUrl: string;
  version: number | null;
}
export type EmailSettingsUpdate = Omit<EmailSettings, 'passwordConfigured'> & { password: string; clearPassword: boolean };

@Injectable({ providedIn: 'root' })
export class EmailSettingsService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.apiUrl + '/api/configuracoes/email';
  read() { return this.http.get<EmailSettings>(this.url); }
  save(settings: EmailSettingsUpdate) { return this.http.put<EmailSettings>(this.url, settings); }
  test() { return this.http.post<{ message: string }>(this.url + '/teste', {}); }
}
