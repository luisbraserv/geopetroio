import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';

@Component({
  selector: 'app-settings-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TuiIcon],
  template: `
    <section class="settings-page">
      <header>
        <p class="eyebrow">Administração</p>
        <h1>Configurações</h1>
        <p class="subtitle">Gerencie as configurações do sistema.</p>
      </header>
      <nav class="settings-tabs" aria-label="Configurações">
        <a routerLink="email" routerLinkActive="active" ariaCurrentWhenActive="page">
          <tui-icon icon="@tui.mail" /> E-mail
        </a>
      </nav>
      <router-outlet />
    </section>
  `,
  styles: [`
    .settings-page { display: grid; align-content: start; gap: 24px; padding: 24px; min-height: 100%; box-sizing: border-box; background: #fff; }
    h1 { margin: 0; color: var(--color-text-primary); font-size: 1.75rem; font-weight: 850; }
    .eyebrow { margin: 0 0 4px; color: var(--color-secondary); font-size: .72rem; font-weight: 800; text-transform: uppercase; }
    .subtitle { margin: 6px 0 0; color: var(--color-text-secondary); }
    .settings-tabs { display: flex; gap: 8px; padding: 6px; width: fit-content; max-width: 100%; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface-muted); }
    .settings-tabs a { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 6px; color: var(--color-text-secondary); font-size: 13px; font-weight: 800; text-decoration: none; }
    .settings-tabs a.active { background: #fff; color: var(--color-primary-hover); box-shadow: 0 2px 8px #528c9c20; }
    @media (max-width: 760px) { .settings-page { padding: 16px; } }
  `],
})
export class SettingsPageComponent {}
