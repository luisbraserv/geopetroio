import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiButton, TuiIcon, TuiTitle } from '@taiga-ui/core';
import { TuiInput } from '@taiga-ui/core/components/input';
import { Store } from '@ngxs/store';
import { Subject } from 'rxjs';

import { Login, ClearAuthError } from '../../features/auth/state/auth.actions';
import { AuthState } from '../../features/auth/state/auth.state';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login-page',
  imports: [CommonModule, FormsModule, TuiButton, TuiIcon, TuiInput, TuiTitle],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.css',
})
export class LoginPageComponent implements OnDestroy {
  private readonly store = inject(Store);
  private readonly destroy$ = new Subject<void>();

  protected readonly username = signal('');
  protected readonly password = signal('');

  /**
   * Versao e ambiente no rodape do login.
   *
   * <p>Fixos por ora, espelhando o que o shell ja exibe. Quando houver versionamento de verdade no
   * build, virao de la — o objetivo aqui e o operador saber qual versao esta acessando antes de
   * relatar um problema.
   */
  protected readonly versao = "1.0.0";
  protected readonly ambiente = environment.production ? "" : "DESENVOLVIMENTO";

  protected readonly isLoading = this.store.selectSignal(AuthState.isLoading);
  protected readonly authError = this.store.selectSignal(AuthState.authError);

  protected submit(): void {
    if (!this.username() || !this.password()) {
      return;
    }
    this.store.dispatch(new Login({ username: this.username(), password: this.password() }));
  }

  protected clearError(): void {
    this.store.dispatch(new ClearAuthError());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
