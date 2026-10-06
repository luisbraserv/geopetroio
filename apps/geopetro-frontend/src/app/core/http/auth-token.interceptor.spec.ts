import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Store } from '@ngxs/store';
import { of } from 'rxjs';
import { authTokenInterceptor } from './auth-token.interceptor';
import { SessionExpired } from '../../features/auth/state/auth.actions';
import { environment } from '../../../environments/environment';

describe('Authentication token isolation', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  const store = { selectSnapshot: () => 'old-token', dispatch: vi.fn(() => of(undefined)) };
  beforeEach(() => {
    store.dispatch.mockClear();
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authTokenInterceptor])), provideHttpClientTesting(),
      { provide: Store, useValue: store },
    ] });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  for (const url of [`${environment.apiUrl}/api/auth/login`, 'https://external.example/api/data']) {
    it(`does not send stored credentials or expire the session for ${url}`, () => {
      client.post(url, {}).subscribe({ error: () => {} });
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({}, { status: 401, statusText: 'Unauthorized' });
      expect(store.dispatch).not.toHaveBeenCalled();
    });
  }

  it('sends the token and expires the session for a protected API response', () => {
    const url = `${environment.apiUrl}/api/usuarios`;
    client.get(url).subscribe({ error: () => {} });
    const request = http.expectOne(url);
    expect(request.request.headers.get('Authorization')).toBe('Bearer old-token');
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(store.dispatch).toHaveBeenCalledWith(expect.any(SessionExpired));
  });
});
