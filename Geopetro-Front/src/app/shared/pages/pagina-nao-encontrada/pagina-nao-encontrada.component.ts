import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiButton, TuiIcon } from '@taiga-ui/core';

@Component({
  selector: 'app-pagina-nao-encontrada',
  imports: [RouterLink, TuiButton, TuiIcon],
  template: `
    <main class="not-found">
      <div class="not-found__content">
        <tui-icon icon="@tui.search-x" class="not-found__icon"></tui-icon>
        <p class="eyebrow">Erro 404</p>
        <h1>Página não encontrada</h1>
        <p class="not-found__text">O endereço acessado não existe ou foi movido.</p>
        <a routerLink="/app/dashboard" tuiButton appearance="primary" size="m">
          Voltar ao painel
        </a>
      </div>
    </main>
  `,
  styles: [`
    .not-found {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 2rem;
      background: var(--app-background);
      color: var(--color-text-on-dark);
    }

    .not-found__content {
      width: min(460px, 100%);
      display: grid;
      justify-items: center;
      gap: 0.85rem;
      text-align: center;
    }

    .not-found__icon {
      font-size: 4rem;
      color: var(--color-accent);
    }

    .eyebrow {
      margin: 0;
      color: var(--color-text-on-dark-muted);
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: clamp(2rem, 8vw, 3.5rem);
    }

    .not-found__text {
      margin: 0 0 0.75rem;
      color: var(--color-text-on-dark-muted);
      line-height: 1.6;
    }
  `],
})
export class PaginaNaoEncontradaComponent {}
