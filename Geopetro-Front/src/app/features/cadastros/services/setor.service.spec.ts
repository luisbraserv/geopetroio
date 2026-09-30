import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { SetorService } from './setor.service';
import { Setor } from '../models/cadastros.model';
import { environment } from '../../../../environments/environment';

const SETOR_MOCK: Setor = { id: 1, nome: 'Operações', centroCusto: 'CC-01', regionalId: 10, regionalNome: 'Bahia' };
const API = `${environment.apiUrl}/api/setores`;

describe('SetorService', () => {
  let service: SetorService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SetorService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SetorService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('deve listar todos os setores', () => {
    service.listar().subscribe((s) => expect(s).toHaveLength(1));
    httpMock.expectOne(API).flush([SETOR_MOCK]);
  });

  it('deve listar setores por regionalId', () => {
    service.listar(10).subscribe((s) => expect(s[0].regionalId).toBe(10));
    const req = httpMock.expectOne(`${API}?regionalId=10`);
    expect(req.request.params.get('regionalId')).toBe('10');
    req.flush([SETOR_MOCK]);
  });

  it('deve buscar setor por id', () => {
    service.buscarPorId(1).subscribe((s) => expect(s.nome).toBe('Operações'));
    httpMock.expectOne(`${API}/1`).flush(SETOR_MOCK);
  });

  it('deve criar setor', () => {
    service.criar({ nome: 'TI', centroCusto: null, regionalId: 10 }).subscribe((s) => expect(s.nome).toBe('Operações'));
    const req = httpMock.expectOne(API);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.regionalId).toBe(10);
    req.flush(SETOR_MOCK);
  });

  it('deve atualizar setor', () => {
    service.atualizar(1, { nome: 'TI', centralCusto: null, regionalId: 10 } as any).subscribe();
    const req = httpMock.expectOne(`${API}/1`);
    expect(req.request.method).toBe('PUT');
    req.flush(SETOR_MOCK);
  });

  it('deve excluir setor', () => {
    service.excluir(1).subscribe();
    const req = httpMock.expectOne(`${API}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
