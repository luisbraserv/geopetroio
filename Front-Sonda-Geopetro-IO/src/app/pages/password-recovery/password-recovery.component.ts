import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TuiButton } from '@taiga-ui/core';
import { PasswordRecoveryService } from '../../features/auth/services/password-recovery.service';
import { parseApiError } from '../../core/http/api-error';

@Component({
  selector: 'app-password-recovery',
  imports: [FormsModule, RouterLink, TuiButton],
  templateUrl: './password-recovery.component.html',
  styleUrl: './password-recovery.component.css',
})
export class PasswordRecoveryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly api = inject(PasswordRecoveryService);
  private readonly destroy = inject(DestroyRef);
  readonly reset = this.route.snapshot.data['reset'] === true;
  private token = '';
  readonly validLink = signal(false);
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal('');
  email = '';
  password = '';
  confirmation = '';

  ngOnInit(): void {
    if (!this.reset) return;
    this.token = new URLSearchParams(this.route.snapshot.fragment ?? '').get('token') ?? '';
    this.validLink.set(/^[A-Za-z0-9_-]{43}$/.test(this.token));
    // O fragmento nao chega ao servidor; apos a leitura, o token vive so em memoria.
    this.location.replaceState('/redefinir-senha');
  }
  submit(): void {
    if (this.busy() || this.done()) return;
    this.error.set('');
    if (this.reset) {
      if (!this.validLink()) return;
      if (this.password.length < 8 || this.password.length > 20 ||
          !/\p{Ll}/u.test(this.password) || !/\p{Lu}/u.test(this.password) ||
          !/\p{Nd}/u.test(this.password) || !/[^\p{L}\p{N}\s]/u.test(this.password)) {
        this.error.set('Use de 8 a 20 caracteres, com letra minúscula, maiúscula, número e caractere especial.');
        return;
      }
      if (this.password !== this.confirmation) { this.error.set('Nova senha e confirmação não conferem.'); return; }
    } else if (!this.email.trim()) { this.error.set('Informe seu e-mail cadastrado.'); return; }
    this.busy.set(true);
    const request: Observable<unknown> = this.reset ? this.api.confirm(this.token, this.password, this.confirmation) : this.api.request(this.email);
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => { this.busy.set(false); this.done.set(true); this.password = ''; this.confirmation = ''; this.token = ''; },
      error: error => { this.busy.set(false); this.error.set(parseApiError(error)); },
    });
  }
}
