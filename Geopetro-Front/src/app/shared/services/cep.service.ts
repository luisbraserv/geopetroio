import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';

export interface EnderecoViaCep {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

@Injectable({ providedIn: 'root' })
export class CepService {
  private readonly http = inject(HttpClient);

  buscar(cep: string): Observable<EnderecoViaCep> {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      return throwError(() => new Error('CEP inválido.'));
    }
    return this.http.get<EnderecoViaCep & { erro?: boolean }>(`https://viacep.com.br/ws/${cepLimpo}/json/`).pipe(
      map((res) => {
        if (res.erro) throw new Error('CEP não encontrado.');
        return res;
      }),
    );
  }
}
