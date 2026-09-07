import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TuiButton, TuiIcon } from '@taiga-ui/core';
import { parseApiError } from '../../core/http/api-error';
import { EmailSettings, EmailSettingsService } from './email-settings.service';

@Component({
  selector: 'app-email-settings',
  imports: [FormsModule, TuiButton, TuiIcon],
  templateUrl: './email-settings.component.html',
  styleUrl: './email-settings.component.css',
})
export class EmailSettingsComponent implements OnInit {
  private readonly api = inject(EmailSettingsService);
  private readonly destroy = inject(DestroyRef);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly testing = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  model: EmailSettings = {
    enabled: false, host: '', port: 587, transport: 'STARTTLS', auth: true,
    username: '', passwordConfigured: false, from: '', frontendUrl: '', version: null,
  };
  password = '';
  clearPassword = false;
  private baseline = '';

  ngOnInit(): void { this.load(); }
  load(): void {
    if (this.loading() || this.busy()) return;
    this.loading.set(true); this.loaded.set(false); this.error.set(''); this.success.set('');
    this.api.read().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: settings => { this.accept(settings); this.loading.set(false); this.loaded.set(true); },
      error: error => { this.loading.set(false); this.error.set(parseApiError(error)); },
    });
  }
  hasChanges(): boolean {
    return JSON.stringify(this.model) !== this.baseline || this.password !== '' || this.clearPassword;
  }
  changeTransport(): void {
    if ([25, 465, 587].includes(this.model.port)) {
      this.model.port = this.model.transport === 'TLS' ? 465 : this.model.transport === 'STARTTLS' ? 587 : 25;
    }
  }
  save(form: NgForm): void {
    if (!this.loaded() || this.busy() || this.testing()) return;
    this.error.set(''); this.success.set('');
    if (form.invalid) { form.control.markAllAsTouched(); this.error.set('Confira os campos obrigatórios.'); return; }
    const { passwordConfigured, ...settings } = this.model;
    this.busy.set(true);
    this.api.save({ ...settings, password: this.password, clearPassword: this.clearPassword })
      .pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: saved => {
          this.accept(saved); this.busy.set(false);
          this.success.set('Configurações de e-mail salvas.');
          form.form.markAsPristine();
        },
        error: error => { this.busy.set(false); this.error.set(parseApiError(error)); },
      });
  }
  test(): void {
    if (!this.loaded() || this.busy() || this.testing() || this.hasChanges() || !this.model.host) return;
    this.testing.set(true); this.error.set(''); this.success.set('');
    this.api.test().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => {
        this.testing.set(false);
        this.success.set('Conexão SMTP validada. Nenhum e-mail foi enviado.');
      },
      error: error => { this.testing.set(false); this.error.set(parseApiError(error)); },
    });
  }
  private accept(settings: EmailSettings): void {
    this.model = { ...settings };
    this.password = ''; this.clearPassword = false;
    this.baseline = JSON.stringify(this.model);
  }
}
