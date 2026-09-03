import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { RegionalService } from './regional.service';
import { Regional } from '../models/cadastros.model';
import { environment } from '../../../../environments/environment';

describe('RegionalService', () => {
  let service: RegionalService;
  let httpMock: HttpTestingController;
  const apiUrl = `${environment.apiUrl}/api/regionais`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RegionalService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RegionalService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('deve listar regionais', () => {
    const mock: Regional[] = [
      { id: 1, nome: 'Bahia', centroCusto: null },
      { id: 2, nome: 'Sergipe', centroCusto: null },
    ];
    service.listar().subscribe((regionais) => {
      expect(regionais).toHaveLength(2);
      expect(regionais[0].nome).toBe('Bahia');
    });
    httpMock.expectOne(apiUrl).flush(mock);
  });

  it('deve buscar regional por id', () => {
    const mock: Regional = { id: 1, nome: 'Bahia', centroCusto: 'CC-01' };
    service.buscarPorId(1).subscribe((r) => expect(r.id).toBe(1));
    httpMock.expectOne(`${apiUrl}/1`).flush(mock);
  });

  it('deve criar regional', () => {
    const mock: Regional = { id: 3, nome: 'Alagoas', centroCusto: null };
    service.criar({ nome: 'Alagoas', centroCusto: null }).subscribe((r) => expect(r.nome).toBe('Alagoas'));
    const req = httpMock.expectOne(apiUrl);
    expect(req.request.method).toBe('POST');
    req.flush(mock);
  });

  it('deve atualizar regional', () => {
    const mock: Regional = { id: 1, nome: 'Bahia Norte', centroCusto: null };
    service.atualizar(1, { nome: 'Bahia Norte', centroCusto: null }).subscribe((r) => expect(r.nome).toBe('Bahia Norte'));
    const req = httpMock.expectOne(`${apiUrl}/1`);
    expect(req.request.method).toBe('PUT');
    req.flush(mock);
  });

  it('deve excluir regional', () => {
    service.excluir(1).subscribe(() => expect(true).toBe(true));
    const req = httpMock.expectOne(`${apiUrl}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('deve emitir erro tratado quando request falha', () => {
    service.listar().subscribe({
      next: () => expect.unreachable('esperava erro'),
      error: (err: Error) => expect(err.message).toBeTruthy(),
    });
    httpMock.expectOne(apiUrl).flush({ message: 'Erro interno' }, { status: 500, statusText: 'Server Error' });
  });
});
