import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface PastaApi {
  id: number;
  nome: string;
  operacao: string;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
  totalCenarios: number;
}

export interface CenarioApi {
  id: number;
  nome: string;
  operacao: string;
  pastaId: number | null;
  pastaNome: string | null;
  formValue: string;
  dadosRelatorio: string | null;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
}

@Injectable({ providedIn: 'root' })
export class SimuladorStateApiService {
  private base = `${environment.apiUrl}/api/simulador`;

  constructor(private http: HttpClient) {}

  // ── Pastas ──
  listarPastas(operacao: string): Observable<PastaApi[]> {
    return this.http.get<PastaApi[]>(`${this.base}/pastas`, { params: { operacao } });
  }

  criarPasta(nome: string, operacao: string): Observable<PastaApi> {
    return this.http.post<PastaApi>(`${this.base}/pastas`, { nome, operacao });
  }

  renomearPasta(id: number, nome: string, operacao: string): Observable<PastaApi> {
    return this.http.put<PastaApi>(`${this.base}/pastas/${id}`, { nome, operacao });
  }

  excluirPasta(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/pastas/${id}`);
  }

  // ── Cenários ──
  listarCenarios(operacao: string, pastaId?: number): Observable<CenarioApi[]> {
    const params: Record<string, string | number> = { operacao };
    if (pastaId != null) params['pastaId'] = pastaId;
    return this.http.get<CenarioApi[]>(`${this.base}/cenarios`, { params });
  }

  listarSemPasta(operacao: string): Observable<CenarioApi[]> {
    return this.http.get<CenarioApi[]>(`${this.base}/cenarios/sem-pasta`, { params: { operacao } });
  }

  criarCenario(payload: {
    nome: string;
    operacao: string;
    pastaId?: number | null;
    formValue: string;
    dadosRelatorio?: string | null;
  }): Observable<CenarioApi> {
    return this.http.post<CenarioApi>(`${this.base}/cenarios`, payload);
  }

  atualizarCenario(id: number, payload: {
    nome: string;
    operacao: string;
    pastaId?: number | null;
    formValue: string;
    dadosRelatorio?: string | null;
  }): Observable<CenarioApi> {
    return this.http.put<CenarioApi>(`${this.base}/cenarios/${id}`, payload);
  }

  excluirCenario(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/cenarios/${id}`);
  }
}
