import { CommonModule } from '@angular/common';
import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { Store } from '@ngxs/store';

import {
  ACESSO_ADMINISTRACAO,
  ACESSO_CONFIGURACAO,
  ACESSO_MONITORAMENTO,
  ACESSO_MONITORAMENTO_REAL,
  ACESSO_SIMULADOR_CIMENTACAO,
  AuthenticatedUser,
  RegraDeAcesso,
  UserRole,
  normalizarRoles,
  satisfazAcesso,
} from '../../../features/auth/models/user.model';
import { Logout } from '../../../features/auth/state/auth.actions';
import { AuthState } from '../../../features/auth/state/auth.state';

interface NavLeaf {
  kind: 'leaf';
  label: string;
  icon: string;
  route: string;
  /** Regra que enxerga esta entrada. Precisa espelhar o guard da rota correspondente. */
  acesso: RegraDeAcesso;
}

interface NavGroup {
  kind: 'group';
  label: string;
  icon: string;
  children: NavLeaf[];
}

type NavEntry = NavLeaf | NavGroup;

const MOBILE_BREAKPOINT = 768;
const ALL_NAV_ENTRIES: NavEntry[] = [
  {
    kind: 'leaf',
    label: 'Dashboard',
    icon: '@tui.layout-dashboard',
    route: '/app/dashboard',
    acesso: ACESSO_ADMINISTRACAO,
  },
  {
    kind: 'group',
    label: 'Sonda/Unidade',
    icon: '@tui.activity',
    children: [
      {
        kind: 'leaf',
        label: 'Monitoramento',
        icon: '@tui.radio-tower',
        route: '/app/monitoramento-sondas',
        acesso: ACESSO_MONITORAMENTO,
      },
      {
        kind: 'leaf',
        label: 'Tempo Real',
        icon: '@tui.zap',
        route: '/app/tempo-real',
        acesso: ACESSO_MONITORAMENTO_REAL,
      },
      {
        // Fica com o monitoramento, e nao com Configuracoes: quem acompanha o ao vivo ajusta o
        // alarme dele (RN-069). Sob Configuracoes so entrariam ADMIN e SUPORTE.
        kind: 'leaf',
        label: 'Limites de Alarme',
        icon: '@tui.bell',
        route: '/app/limites-alarme',
        acesso: ACESSO_MONITORAMENTO_REAL,
      },
      {
        kind: 'leaf',
        label: 'Histórico de Alarmes',
        icon: '@tui.history',
        route: '/app/historico-alarmes',
        acesso: ACESSO_MONITORAMENTO_REAL,
      },
    ],
  },
  {
    // Área de simuladores, e não de cimentação: a cimentação é o primeiro simulador, não o assunto
    // do grupo. Outros simuladores entram como irmãos de 'Cimentação', sem remontar o menu.
    kind: 'group',
    label: 'Simulador',
    icon: '@tui.flask-conical',
    children: [
      {
        kind: 'leaf',
        label: 'Cimentação',
        icon: '@tui.layers',
        route: '/app/simulador',
        acesso: ACESSO_SIMULADOR_CIMENTACAO,
      },
    ],
  },
  {
    kind: 'group',
    label: 'Administração',
    icon: '@tui.shield',
    children: [
      {
        kind: 'leaf',
        label: 'Cadastros',
        icon: '@tui.clipboard-list',
        route: '/app/cadastros',
        acesso: ACESSO_ADMINISTRACAO,
      },
      {
        kind: 'leaf',
        label: 'Configurações',
        icon: '@tui.settings',
        route: '/app/configuracoes',
        acesso: ACESSO_CONFIGURACAO,
      },
    ],
  },
];


@Component({
  selector: 'app-shell',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, TuiIcon],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
})
export class ShellComponent {
  private readonly store = inject(Store);
  protected readonly currentUser = this.store.selectSignal(AuthState.currentUser);
  protected readonly sidebarCollapsed = signal(false);
  protected readonly mobileOpen = signal(false);
  private readonly isMobile = signal(window.innerWidth < MOBILE_BREAKPOINT);

  protected readonly showLabels = computed(
    () => (!this.sidebarCollapsed() && !this.isMobile()) || this.mobileOpen(),
  );

  protected readonly toggleIcon = computed(() => {
    if (this.isMobile()) return this.mobileOpen() ? '@tui.x' : '@tui.menu';
    return this.sidebarCollapsed() ? '@tui.chevron-right' : '@tui.chevron-left';
  });

  /**
   * Menu filtrado pelas roles do usuário.
   *
   * A visibilidade vem da própria entrada (`acesso`), não de condicionais por rótulo — assim uma
   * entrada nova não aparece por engano só porque ninguém lembrou de tratá-la aqui. Um grupo cujos
   * filhos foram todos filtrados é removido, evitando cabeçalho vazio no menu.
   *
   * Isto é conveniência de interface, não controle de acesso: quem decide é o `authGuard` na rota
   * e, em última instância, o backend.
   */
  protected readonly navEntries = computed(() => {
    const roles = obterRolesUsuario(this.currentUser());

    return ALL_NAV_ENTRIES.flatMap<NavEntry>((entry) => {
      if (entry.kind === 'leaf') {
        return satisfazAcesso(roles, entry.acesso) ? [entry] : [];
      }

      const children = entry.children.filter((child) => satisfazAcesso(roles, child.acesso));
      return children.length > 0 ? [{ ...entry, children }] : [];
    });
  });

  protected asGroup(e: NavEntry): NavGroup { return e as NavGroup; }
  protected asLeaf(e: NavEntry): NavLeaf { return e as NavLeaf; }

  @HostListener('window:resize')
  onResize(): void {
    this.isMobile.set(window.innerWidth < MOBILE_BREAKPOINT);
    this.mobileOpen.set(false);
  }

  protected toggleSidebar(): void {
    if (this.isMobile()) {
      this.mobileOpen.update((v) => !v);
    } else {
      this.sidebarCollapsed.update((v) => !v);
    }
  }

  protected closeMobileMenu(): void {
    this.mobileOpen.set(false);
  }

  protected logout(): void {
    this.store.dispatch(new Logout());
  }
}

function obterRolesUsuario(user: AuthenticatedUser | null): UserRole[] {
  return normalizarRoles([...(user?.roles ?? []), user?.role].filter(Boolean) as string[]);
}

