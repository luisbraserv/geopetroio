import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { PocoApi, PocoGeometry } from '../models/poco.model';

@Injectable({ providedIn: 'root' })
export class PocoApiService {
  private readonly url = `${environment.apiUrl}/api/simulador/pocos`;
  constructor(private http: HttpClient) {}
  list() { return this.http.get<PocoApi[]>(this.url); }
  get(id: number) { return this.http.get<PocoApi>(`${this.url}/${id}`); }
  create(nome: string, geometria: PocoGeometry) { return this.http.post<PocoApi>(this.url, { nome, geometria }); }
  update(poco: PocoApi, nome: string, geometria: PocoGeometry) {
    return this.http.put<PocoApi>(`${this.url}/${poco.id}`, { nome, geometria, version: poco.version });
  }
  delete(id: number) { return this.http.delete<void>(`${this.url}/${id}`); }
}
