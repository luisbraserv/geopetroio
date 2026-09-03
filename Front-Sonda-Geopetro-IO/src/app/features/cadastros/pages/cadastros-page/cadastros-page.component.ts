import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { Store } from '@ngxs/store';

import { AuthState } from '../../../auth/state/auth.state';

@Component({
  selector: 'app-cadastros-page',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, TuiIcon],
  template: `
    <section class="cadastros-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Administracao</p>
          <h1>Cadastros</h1>
          <p class="page-subtitle">Gerencie os cadastros do sistema em uma area unica.</p>
        </div>
      </header>

      <nav class="cadastro-tabs" aria-label="Modulos de cadastro">
        @for (tab of tabs(); track tab.route) {
          <a class="cadastro-tab" [routerLink]="tab.route" routerLinkActive="cadastro-tab--active" [routerLinkActiveOptions]="{ exact: true }">
            <tui-icon [icon]="tab.icon"></tui-icon>
            <span>{{ tab.label }}</span>
          </a>
        }
      </nav>

      <div class="cadastro-content">
        <router-outlet />
      </div>
    </section>
  `,
  styles: [`
    .cadastros-page { width: 100%; min-height: 100%; display: grid; align-content: start; gap: 18px; padding: 24px; box-sizing: border-box; background: #fff; color: var(--color-text-primary); }
    .page-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    h1 { margin: 0; color: var(--color-text-primary); font-size: 1.75rem; font-weight: 850; }
    .eyebrow, .page-subtitle { margin: 0; color: var(--color-text-secondary); }
    .eyebrow { margin-bottom: 4px; color: var(--color-secondary); font-size: .72rem; font-weight: 800; text-transform: uppercase; }
    .page-subtitle { margin-top: 6px; line-height: 1.45; }
    .cadastro-tabs { display: flex; gap: 8px; flex-wrap: wrap; padding: 6px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface-muted); width: fit-content; max-width: 100%; }
    .cadastro-tab { min-height: 38px; display: inline-flex; align-items: center; gap: 8px; padding: 0 14px; border: 1px solid transparent; border-radius: 6px; color: var(--color-text-secondary); font-size: 13px; font-weight: 800; text-decoration: none; white-space: nowrap; }
    .cadastro-tab:hover, .cadastro-tab--active { border-color: rgba(82, 140, 156, .34); background: #fff; color: var(--color-primary-hover); box-shadow: 0 2px 8px rgba(82, 140, 156, .12); }
    .cadastro-content { min-width: 0; }
    .cadastro-content ::ng-deep > * > .page, .cadastro-content ::ng-deep > * > .usuarios-page { padding: 0 !important; }
    @media (max-width: 760px) { .cadastros-page { padding: 16px; } .cadastro-tabs, .cadastro-tab { width: 100%; } }
  `],
})
export class CadastrosPageComponent {
  private readonly store = inject(Store);
  private readonly currentUser = this.store.selectSignal(AuthState.currentUser);

  protected readonly tabs = computed(() => {
    const roles = this.currentUser()?.roles ?? [];
    const isAdmin = roles.includes('ADMIN');
    const tabs = [
      { label: 'Usuarios', icon: '@tui.users', route: 'usuarios', adminOnly: true },
      { label: 'Empresas', icon: '@tui.building-2', route: 'empresas', adminOnly: true },
      { label: 'Regionais', icon: '@tui.map-pin', route: 'regionais', adminOnly: true },
      { label: 'Setores', icon: '@tui.network', route: 'setores', adminOnly: true },
      { label: 'Unidades/Sondas', icon: '@tui.landmark', route: 'unidades-sondas', adminOnly: true },
    ];

    return tabs.filter((tab) => isAdmin || !tab.adminOnly);
  });
}
