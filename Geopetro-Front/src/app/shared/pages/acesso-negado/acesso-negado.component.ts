import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiButton, TuiIcon } from '@taiga-ui/core';

@Component({
  selector: 'app-acesso-negado',
  imports: [RouterLink, TuiButton, TuiIcon],
  template: `
    <div class="denied">
      <tui-icon icon="@tui.shield-x" class="denied__icon"></tui-icon>
      <h1 class="denied__title">Acesso Negado</h1>
      <p class="denied__text">
        Você não tem permissão para acessar esta página.<br />
        Verifique seu perfil de acesso com o administrador.
      </p>
      <a routerLink="/app/dashboard" tuiButton appearance="primary" size="m">
        Voltar ao Dashboard
      </a>
    </div>
  `,
  styles: [`
    :host { display: grid; place-items: center; min-height: 100dvh; }
    .denied { display: flex; flex-direction: column; align-items: center; gap: 1rem;
      padding: 2rem; text-align: center; color: var(--color-text-on-dark); }
    .denied__icon { font-size: 4rem; color: #f87171; }
    .denied__title { margin: 0; font-size: 2rem; }
    .denied__text { margin: 0; color: var(--color-text-on-dark-muted); line-height: 1.6; }
  `],
})
export class AcessoNegadoComponent {}
