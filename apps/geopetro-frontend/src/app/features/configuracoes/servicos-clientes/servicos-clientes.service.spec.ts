import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../../../environments/environment';
import { ServicosClientesService } from './servicos-clientes.service';

describe('ServicosClientesService', () => {
  let service: ServicosClientesService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/api/servicos-clientes`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ServicosClientesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('cria o cliente com escopos e recebe o segredo exibido uma vez', () => {
    service.criar({ id: 'erp', nome: 'ERP', escopos: ['unidades:ler'] }).subscribe((resposta) => {
      expect(resposta.segredo).toBe('segredo-unico');
    });
    const req = http.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ id: 'erp', nome: 'ERP', escopos: ['unidades:ler'] });
    req.flush({ id: 'erp', segredo: 'segredo-unico', aviso: 'Copie agora' });
  });

  it('rotaciona e desativa usando as rotas do Core', () => {
    service.gerarNovoSegredo('meu serviço').subscribe();
    http.expectOne(`${url}/meu%20servi%C3%A7o/segredo`).flush({ id: 'meu serviço', segredo: 'novo', aviso: 'Copie' });

    service.desativar('erp').subscribe();
    const req = http.expectOne(`${url}/erp/desativar`);
    expect(req.request.method).toBe('PATCH');
    req.flush(null);
  });
});
