import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NgForm } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { EmailSettingsComponent } from './email-settings.component';
import { EmailSettings } from './email-settings.service';
import { environment } from '../../../environments/environment';

describe('Corporate SMTP settings', () => {
  const url = environment.apiUrl + '/api/configuracoes/email';
  const saved: EmailSettings = { enabled: true, host: 'smtp.example.test', port: 587,
    transport: 'STARTTLS', auth: true, username: 'mailer', passwordConfigured: true,
    from: 'mailer@example.test', frontendUrl: 'https://app.example.test', version: 2 };
  let http: HttpTestingController;
  async function setup(load = true) {
    TestBed.configureTestingModule({ imports: [EmailSettingsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EmailSettingsComponent);
    fixture.detectChanges();
    if (load) {
      http.expectOne(url).flush(saved);
      fixture.detectChanges();
      await fixture.whenStable();
    }
    return { fixture, component: fixture.componentInstance,
      form: () => fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm) };
  }
  afterEach(() => http.verify());

  it('loads the settings and leaves the stored password out of the input', async () => {
    const { fixture, component } = await setup();
    expect(component.model.host).toBe(saved.host);
    expect(fixture.nativeElement.querySelector('#smtp-password').value).toBe('');
    expect(fixture.nativeElement.querySelector('#password-help').textContent).toContain('Deixe em branco');
    expect(component.hasChanges()).toBe(false);
  });
  it('saves a complete versioned request while preserving a blank password', async () => {
    const { fixture, component, form } = await setup();
    component.model.host = 'new.example.test';
    component.save(form());
    const request = http.expectOne(url);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.password).toBe('');
    expect(request.request.body.clearPassword).toBe(false);
    expect(request.request.body.version).toBe(2);
    expect(request.request.body.passwordConfigured).toBeUndefined();
    request.flush({ ...saved, host: 'new.example.test', version: 3 });
    fixture.detectChanges();
    expect(component.model.version).toBe(3);
    expect(component.hasChanges()).toBe(false);
    expect(component.success()).toContain('salvas');
  });
  it('clears a replacement password from memory after saving', async () => {
    const { component, form } = await setup();
    component.password = 'new-test-secret';
    component.save(form());
    const request = http.expectOne(url);
    expect(request.request.body.password).toBe('new-test-secret');
    request.flush({ ...saved, version: 3 });
    expect(component.password).toBe('');
    expect(component.clearPassword).toBe(false);
  });
  it('sends explicit credential removal instead of treating an empty input as deletion', async () => {
    const { component, form } = await setup();
    component.model.enabled = false; component.clearPassword = true;
    component.save(form());
    const request = http.expectOne(url);
    expect(request.request.body.clearPassword).toBe(true);
    request.flush({ ...saved, enabled: false, passwordConfigured: false, version: 3 });
    expect(component.model.passwordConfigured).toBe(false);
  });
  it('tests only the saved settings without transmitting a password', async () => {
    const { component } = await setup();
    component.model.port = 465; component.test(); http.expectNone(url + '/teste');
    component.model.port = 587; component.test(); component.test();
    const request = http.expectOne(url + '/teste');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ message: 'OK' });
    expect(component.testing()).toBe(false);
    expect(component.success()).toContain('Nenhum e-mail');
  });
  it('cannot overwrite configuration when loading fails', async () => {
    const { component, fixture } = await setup(false);
    http.expectOne(url).flush({ message: 'Unavailable' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(component.loaded()).toBe(false);
    component.save(null as unknown as NgForm);
    http.expectNone(url);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it('keeps edits after a conflict and reports a connection failure honestly', async () => {
    const { component, form } = await setup();
    component.password = 'draft-secret'; component.save(form());
    http.expectOne(url).flush({ message: 'Recarregue antes de salvar' }, { status: 409, statusText: 'Conflict' });
    expect(component.password).toBe('draft-secret');
    expect(component.error()).toContain('Recarregue');
    expect(component.busy()).toBe(false);
    component.password = ''; component.test();
    http.expectOne(url + '/teste').flush({ message: 'Falha SMTP' }, { status: 502, statusText: 'Bad Gateway' });
    expect(component.testing()).toBe(false);
    expect(component.success()).toBe('');
    expect(component.error()).toContain('Falha SMTP');
  });
});
