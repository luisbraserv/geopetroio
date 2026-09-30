import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  UrlTree,
} from '@angular/router';
import { Store } from '@ngxs/store';

import {
  AuthenticatedUser,
  RegraDeAcesso,
  UserRole,
  normalizarRoles,
  satisfazAcesso,
} from '../models/user.model';
import { AuthState } from '../state/auth.state';

/**
 * Guard de autenticação e autorização.
 *
 * Uso nas rotas:
 *   canActivate: [authGuard]
 *   data: { acesso: ACESSO_MONITORAMENTO }  // opcional — omitir para qualquer autenticado
 *
 * O `acesso` é uma **regra** (lista de combinações), não uma lista de roles: desde 2026-09-17 o
 * acesso é tipo de conta somado a permissão de módulo, e `MONITORAMENTO` sozinha não concede nada.
 *
 * ⚠️ Isto é conveniência de interface — evitar que o usuário navegue para uma tela que o servidor
 * vai recusar. Quem decide é o backend.
 */
export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
): boolean | UrlTree => {
  const store = inject(Store);
  const router = inject(Router);

  const isAuthenticated = store.selectSnapshot(AuthState.isAuthenticated);

  if (!isAuthenticated) {
    return router.createUrlTree(['/login']);
  }

  const acesso = route.data['acesso'] as RegraDeAcesso | undefined;

  if (acesso && acesso.length > 0) {
    const currentUser = store.selectSnapshot(AuthState.currentUser);

    if (!satisfazAcesso(obterRolesUsuario(currentUser), acesso)) {
      return router.createUrlTree(['/acesso-negado']);
    }
  }

  return true;
};

function obterRolesUsuario(user: AuthenticatedUser | null): UserRole[] {
  return normalizarRoles([...(user?.roles ?? []), user?.role].filter(Boolean) as string[]);
}
