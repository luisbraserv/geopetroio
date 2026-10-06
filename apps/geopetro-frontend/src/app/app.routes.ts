import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { Store } from '@ngxs/store';

import { authGuard } from './features/auth/guards/auth.guard';
import {
  ACESSO_ADMINISTRACAO,
  ACESSO_CADASTROS,
  ACESSO_CONFIGURACAO,
  ACESSO_MONITORAMENTO,
  ACESSO_MONITORAMENTO_REAL,
  ACESSO_SIMULADOR_CIMENTACAO,
  ACESSO_UNIDADES,
  normalizarRoles,
  rotaInicialPara,
} from './features/auth/models/user.model';
import { AuthState } from './features/auth/state/auth.state';


export const routes: Routes = [
  // Rotas públicas
  {
    path: 'recuperar-senha',
    loadComponent: () => import('./pages/password-recovery/password-recovery.component').then(m => m.PasswordRecoveryComponent),
  },
  {
    path: 'redefinir-senha', data: { reset: true },
    loadComponent: () => import('./pages/password-recovery/password-recovery.component').then(m => m.PasswordRecoveryComponent),
  },
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: 'acesso-negado',
    loadComponent: () =>
      import('./shared/pages/acesso-negado/acesso-negado.component').then(
        (m) => m.AcessoNegadoComponent,
      ),
  },

  // Rotas privadas — protegidas pelo authGuard
  {
    path: 'app',
    loadComponent: () =>
      import('./shared/layout/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        // Destino depende do papel: mandar todos para 'dashboard' jogaria um CLIENTE
        // direto em "acesso negado", já que o Dashboard é exclusivo de ADMIN.
        path: '',
        redirectTo: () => {
          const store = inject(Store);
          const user = store.selectSnapshot(AuthState.currentUser);
          return rotaInicialPara(normalizarRoles([...(user?.roles ?? []), user?.role]));
        },
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard-page.component').then(
            (m) => m.DashboardPageComponent,
          ),
        canActivate: [authGuard],
        data: { acesso: ACESSO_ADMINISTRACAO },
      },
      {
        path: 'simulador',
        canActivate: [authGuard],
        data: { acesso: ACESSO_SIMULADOR_CIMENTACAO },
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/simulador/pages/simulador-index/simulador-index.component').then(
                (m) => m.SimuladorIndexComponent,
              ),
          },
          {
            path: 'squeeze',
            loadComponent: () =>
              import('./features/simulador/pages/simulador-squeeze/simulador-squeeze.component').then(
                (m) => m.SimuladorSqueezeComponent,
              ),
          },
          {
            path: 'tampao',
            loadComponent: () =>
              import('./features/simulador/pages/simulador-tampao/simulador-tampao.component').then(
                (m) => m.SimuladorTampaoComponent,
              ),
          },
          {
            path: 'primaria',
            loadComponent: () =>
              import('./features/simulador/pages/simulador-primaria/simulador-primaria.component').then(
                (m) => m.SimuladorPrimariaComponent,
              ),
          },
        ],
      },
      {
        path: 'administracao/usuarios',
        redirectTo: 'cadastros/usuarios',
        pathMatch: 'full',
      },
      {
        path: 'configuracoes',
        loadComponent: () => import('./features/configuracoes/settings-page.component').then(m => m.SettingsPageComponent),
        canActivate: [authGuard],
        data: { acesso: ACESSO_CONFIGURACAO },
        children: [
          { path: '', redirectTo: 'email', pathMatch: 'full' },
          {
            path: 'email',
            loadComponent: () => import('./features/configuracoes/email-settings.component').then(m => m.EmailSettingsComponent),
          },
          {
            path: 'servicos-clientes',
            loadComponent: () => import('./features/configuracoes/servicos-clientes/servicos-clientes.component').then(m => m.ServicosClientesComponent),
            canActivate: [authGuard],
            data: { acesso: ACESSO_ADMINISTRACAO },
          },
        ],
      },
      {
        path: 'cadastros',
        loadComponent: () =>
          import('./features/cadastros/pages/cadastros-page/cadastros-page.component').then(
            (m) => m.CadastrosPageComponent,
          ),
        canActivate: [authGuard],
        data: { acesso: ACESSO_CADASTROS },
        children: [
          {
            path: '',
            redirectTo: () => {
              const store = inject(Store);
              const user = store.selectSnapshot(AuthState.currentUser);
              const roles = normalizarRoles([...(user?.roles ?? []), user?.role]);
              return roles.includes('ADMIN') ? 'usuarios' : 'unidades';
            },
            pathMatch: 'full',
          },
          {
            path: 'usuarios',
            loadComponent: () =>
              import('./features/usuarios/pages/usuarios-admin-page/usuarios-admin-page.component').then(
                (m) => m.UsuariosAdminPageComponent,
              ),
            canActivate: [authGuard],
            data: { acesso: ACESSO_ADMINISTRACAO },
          },
          {
            path: 'empresas',
            loadComponent: () =>
              import('./features/cadastros/pages/empresas-page/empresas-page.component').then(
                (m) => m.EmpresasPageComponent,
              ),
            canActivate: [authGuard],
            data: { acesso: ACESSO_ADMINISTRACAO },
          },
          {
            path: 'regionais',
            loadComponent: () =>
              import('./features/cadastros/pages/regionais-page/regionais-page.component').then(
                (m) => m.RegionaisPageComponent,
              ),
            canActivate: [authGuard],
            data: { acesso: ACESSO_ADMINISTRACAO },
          },
          {
            path: 'setores',
            loadComponent: () =>
              import('./features/cadastros/pages/setores-page/setores-page.component').then(
                (m) => m.SetoresPageComponent,
              ),
            canActivate: [authGuard],
            data: { acesso: ACESSO_ADMINISTRACAO },
          },
          {
            path: 'unidades',
            loadComponent: () =>
              import(
                './features/cadastros/pages/unidades-page/unidades-page.component'
              ).then((m) => m.UnidadesPageComponent),
            canActivate: [authGuard],
            data: { acesso: ACESSO_UNIDADES },
          },
        ],
      },
      {
        path: 'monitoramento-unidades',
        loadComponent: () =>
          import('./features/monitoramento/pages/monitoramento-unidade-page/monitoramento-unidade-page.component').then(
            (m) => m.MonitoramentoUnidadePageComponent,
          ),
        canActivate: [authGuard],
        data: { acesso: ACESSO_MONITORAMENTO },
      },
      {
        path: 'tempo-real',
        loadComponent: () =>
          import('./features/monitoramento/pages/tempo-real-page/tempo-real-page.component').then(
            (m) => m.TempoRealPageComponent,
          ),
        canActivate: [authGuard],
        data: { acesso: ACESSO_MONITORAMENTO_REAL },
      },
      {
        // Acompanha o tempo real, e nao o monitoramento nem as configuracoes: quem acompanha o ao
        // vivo ajusta o alarme dele, inclusive CLIENTE (RN-069). Restringir a ADMIN mataria o
        // "ajustavel na hora"; deixar em ACESSO_MONITORAMENTO daria o limite a quem so ve series.
        path: 'limites-alarme',
        loadComponent: () =>
          import('./features/monitoramento/pages/limites-alarme-page/limites-alarme-page.component').then(
            (m) => m.LimitesAlarmePageComponent,
          ),
        canActivate: [authGuard],
        data: { acesso: ACESSO_MONITORAMENTO_REAL },
      },
      {
        // RN-069: ver o historico e ajustar o limite sao a mesma autoridade, inclusive CLIENTE.
        path: 'historico-alarmes',
        loadComponent: () =>
          import('./features/monitoramento/pages/historico-alarmes-page/historico-alarmes-page.component').then(
            (m) => m.HistoricoAlarmesPageComponent,
          ),
        canActivate: [authGuard],
        data: { acesso: ACESSO_MONITORAMENTO_REAL },
      },
      {
        path: 'meu-usuario',
        loadComponent: () =>
          import('./features/usuarios/pages/meu-usuario-page/meu-usuario-page.component').then(
            (m) => m.MeuUsuarioPageComponent,
          ),
      },
      {
        path: '**',
        loadComponent: () =>
          import('./shared/pages/pagina-nao-encontrada/pagina-nao-encontrada.component').then(
            (m) => m.PaginaNaoEncontradaComponent,
          ),
      },
    ],
  },

  {
    path: '404',
    loadComponent: () =>
      import('./shared/pages/pagina-nao-encontrada/pagina-nao-encontrada.component').then(
        (m) => m.PaginaNaoEncontradaComponent,
      ),
  },

  // Fallback
  {
    path: '**',
    loadComponent: () =>
      import('./shared/pages/pagina-nao-encontrada/pagina-nao-encontrada.component').then(
        (m) => m.PaginaNaoEncontradaComponent,
      ),
  },
];
