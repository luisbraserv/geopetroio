import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthException, AuthService } from '../../features/auth/services/auth.service';
import { UsuariosService } from '../../features/usuarios/services/usuarios.service';
import { environment } from '../../../environments/environment';

describe('Identity API routing', () => {
  let http: HttpTestingController;
  let users: UsuariosService;
  const contact = { nome: 'Ana', telefone: '71999999999', email: 'ana@example.test',
    cep: '', logradouro: '', bairro: '', cidade: '', estado: '', numero: '', complemento: '' };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    users = TestBed.inject(UsuariosService);
  });
  afterEach(() => http.verify());

  it('posts credentials to /api/auth/login and preserves the authenticated user', () => {
    TestBed.inject(AuthService).authenticate$('ana', 'test-only').subscribe(user => {
      expect(user.username).toBe('ana');
      expect(user.token).toBe('test-token');
      expect(user.roles).toEqual(['INTERNO']);
    });
    const request = http.expectOne(`${environment.apiUrl}/api/auth/login`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ username: 'ana', password: 'test-only' });
    request.flush({ username: 'ana', token: 'test-token', roles: ['INTERNO'] });
  });

  it('handles an authentication response without roles without crashing', () => {
    TestBed.inject(AuthService).authenticate$('ana', 'test-only').subscribe(user => {
      expect(user.role).toBe('INTERNO');
      expect(user.roles).toEqual([]);
    });
    http.expectOne(`${environment.apiUrl}/api/auth/login`)
      .flush({ username: 'ana', token: 'test-token' });
  });

  it('keeps authentication errors on the new route', () => {
    TestBed.inject(AuthService).authenticate$('ana', 'invalid').subscribe({
      next: () => expect.unreachable(),
      error: error => expect(error).toBeInstanceOf(AuthException),
    });
    http.expectOne(`${environment.apiUrl}/api/auth/login`)
      .flush({ message: 'Login recusado' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('keeps list pagination and search in query parameters', () => {
    users.listar(2, 10, 'Ana Silva').subscribe();
    const request = http.expectOne(req => req.url === `${environment.apiUrl}/api/usuarios`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('pagina')).toBe('2');
    expect(request.request.params.get('tamanho')).toBe('10');
    expect(request.request.params.get('busca')).toBe('Ana Silva');
    request.flush({ conteudo: [], totalElementos: 0 });
  });

  it('routes client and internal user creation without changing payloads', () => {
    const client = { ...contact, id: 1, empresaId: 2, username: 'cliente', password: 'test-only', roles: [], unidadeSondaIds: [3] };
    const internal = { ...contact, matricula: 1, username: 'ana', password: 'test-only', roles: [] };
    users.criarCliente(client).subscribe();
    users.criarInterno(internal).subscribe();
    for (const [suffix, payload] of [['clientes', client], ['internos', internal]] as const) {
      const request = http.expectOne(`${environment.apiUrl}/api/usuarios/${suffix}`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(payload);
      request.flush({});
    }
  });

  it('encodes the username for administrative updates', () => {
    const payload = { ...contact, roles: [] };
    users.atualizarUsuario('ana+campo', payload).subscribe();
    const request = http.expectOne(`${environment.apiUrl}/api/usuarios/ana%2Bcampo`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual(payload);
    request.flush({});
  });

  it('keeps self-service contact and password on distinct PATCH endpoints', () => {
    const password = { senhaAtual: 'old', novaSenha: 'new', confirmacaoSenha: 'new' };
    users.atualizarMeuUsuario(contact).subscribe();
    users.alterarMinhaSenha(password).subscribe();
    for (const [suffix, payload] of [['me', contact], ['me/senha', password]] as const) {
      const request = http.expectOne(`${environment.apiUrl}/api/usuarios/${suffix}`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual(payload);
      request.flush({});
    }
  });
});
