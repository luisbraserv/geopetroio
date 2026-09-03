import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { Store } from '@ngxs/store';

import { authGuard } from './features/auth/guards/auth.guard';
import {
  normalizarRoles,
  ROLES_ADMINISTRACAO,
  ROLES_MONITORAMENTO,
  ROLES_SIMULADOR,
  rotaInicialPara,
} from './features/auth/models/user.model';
import { AuthState } from './features/auth/state/auth.state';


export const routes: Routes = [
  // Rotas públicas
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
        data: { roles: ROLES_ADMINISTRACAO },
      },
      {
        path: 'simulador',
        canActivate: [authGuard],
        data: { roles: ROLES_SIMULADOR },
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
        ],
      },
      {
        path: 'administracao/usuarios',
        redirectTo: 'cadastros/usuarios',
        pathMatch: 'full',
      },
      {
        path: 'cadastros',
        loadComponent: () =>
          import('./features/cadastros/pages/cadastros-page/cadastros-page.component').then(
            (m) => m.CadastrosPageComponent,
          ),
        canActivate: [authGuard],
        data: { roles: ROLES_ADMINISTRACAO },
        children: [
          {
            path: '',
            redirectTo: 'usuarios',
            pathMatch: 'full',
          },
          {
            path: 'usuarios',
            loadComponent: () =>
              import('./features/usuarios/pages/usuarios-admin-page/usuarios-admin-page.component').then(
                (m) => m.UsuariosAdminPageComponent,
              ),
            canActivate: [authGuard],
            data: { roles: ROLES_ADMINISTRACAO },
          },
          {
            path: 'empresas',
            loadComponent: () =>
              import('./features/cadastros/pages/empresas-page/empresas-page.component').then(
                (m) => m.EmpresasPageComponent,
              ),
            canActivate: [authGuard],
            data: { roles: ROLES_ADMINISTRACAO },
          },
          {
            path: 'regionais',
            loadComponent: () =>
              import('./features/cadastros/pages/regionais-page/regionais-page.component').then(
                (m) => m.RegionaisPageComponent,
              ),
            canActivate: [authGuard],
            data: { roles: ROLES_ADMINISTRACAO },
          },
          {
            path: 'setores',
            loadComponent: () =>
              import('./features/cadastros/pages/setores-page/setores-page.component').then(
                (m) => m.SetoresPageComponent,
              ),
            canActivate: [authGuard],
            data: { roles: ROLES_ADMINISTRACAO },
          },
          {
            path: 'unidades-sondas',
            loadComponent: () =>
              import(
                './features/cadastros/pages/unidades-sondas-page/unidades-sondas-page.component'
              ).then((m) => m.UnidadesSondasPageComponent),
            canActivate: [authGuard],
            data: { roles: ROLES_ADMINISTRACAO },
          },
        ],
      },
      {
        path: 'monitoramento-sondas',
        loadComponent: () =>
          import('./features/monitoramento/pages/monitoramento-sonda-page/monitoramento-sonda-page.component').then(
            (m) => m.MonitoramentoSondaPageComponent,
          ),
        canActivate: [authGuard],
        data: { roles: ROLES_MONITORAMENTO },
      },
      {
        path: 'tempo-real',
        loadComponent: () =>
          import('./features/monitoramento/pages/tempo-real-page/tempo-real-page.component').then(
            (m) => m.TempoRealPageComponent,
          ),
        canActivate: [authGuard],
        data: { roles: ROLES_MONITORAMENTO },
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
