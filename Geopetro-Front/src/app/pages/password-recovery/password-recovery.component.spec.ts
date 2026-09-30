import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PasswordRecoveryComponent } from './password-recovery.component';
import { environment } from '../../../environments/environment';

describe('Password recovery', () => {
  const token = 'x'.repeat(43);
  const url = environment.apiUrl + '/api/auth/recuperacao-senha';
  let http: HttpTestingController;
  function setup(reset = false, fragment: string | null = null) {
    TestBed.configureTestingModule({
      imports: [PasswordRecoveryComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { reset }, fragment } } }],
    });
    http = TestBed.inject(HttpTestingController);
    const location = TestBed.inject(Location);
    const replace = vi.spyOn(location, 'replaceState');
    const fixture = TestBed.createComponent(PasswordRecoveryComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, replace };
  }
  afterEach(() => http?.verify());

  it('sends the email and displays generic success without authentication', () => {
    const { fixture, component } = setup();
    component.email = '  ana@example.test  ';
    component.submit();
    component.submit();
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'ana@example.test' });
    request.flush({ message: 'Accepted' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    expect(component.done()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Se houver uma conta ativa');
    expect(fixture.nativeElement.querySelector('a[href="/login"]')).toBeTruthy();
  });

  it('extracts the link from the fragment and removes it from the URL without consuming it', () => {
    const { component, replace } = setup(true, 'token=' + token);
    expect(component.validLink()).toBe(true);
    expect(replace).toHaveBeenCalledWith('/redefinir-senha');
    http.expectNone(url + '/confirmar');
  });

  it('rejects a missing or malformed link before sending a password', () => {
    const { fixture, component } = setup(true, 'token=invalid');
    component.password = component.confirmation = 'NovaSenha1!';
    component.submit();
    expect(component.validLink()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    http.expectNone(url + '/confirmar');
  });

  it('validates strength and confirmation while retaining a usable link', () => {
    const { component } = setup(true, 'token=' + token);
    component.password = component.confirmation = 'weak';
    component.submit(); expect(component.error()).toContain('8 a 20');
    component.password = 'NovaSenha1!'; component.confirmation = 'OtherPwd2!';
    component.submit(); expect(component.error()).toContain('conferem');
    http.expectNone(url + '/confirmar');
    component.confirmation = component.password; component.submit();
    const request = http.expectOne(url + '/confirmar');
    expect(request.request.body).toEqual({ token, novaSenha: 'NovaSenha1!', confirmacaoSenha: 'NovaSenha1!' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(component.done()).toBe(true);
    expect(component.password).toBe('');
    expect(component.confirmation).toBe('');
  });

  it('shows an expired-link error and keeps the option to request another', () => {
    const { component, fixture } = setup(true, 'token=' + token);
    component.password = component.confirmation = 'NovaSenha1!'; component.submit();
    http.expectOne(url + '/confirmar').flush({ message: 'Link expirado' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(component.done()).toBe(false);
    expect(component.busy()).toBe(false);
    expect(component.error()).toContain('Link expirado');
    expect(fixture.nativeElement.querySelector('a[href="/recuperar-senha"]')).toBeTruthy();
  });

  it('shows service unavailable instead of claiming an email was sent', () => {
    const { component } = setup();
    component.email = 'ana@example.test'; component.submit();
    http.expectOne(url).flush({ message: 'Servico indisponivel' }, { status: 503, statusText: 'Unavailable' });
    expect(component.done()).toBe(false);
    expect(component.busy()).toBe(false);
    expect(component.error()).toContain('Servico indisponivel');
  });
});
