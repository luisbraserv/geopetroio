import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  UrlTree,
} from '@angular/router';
import { Store } from '@ngxs/store';

import { AuthenticatedUser, UserRole } from '../models/user.model';
import { AuthState } from '../state/auth.state';

/**
 * Guard de autenticação e autorização por role.
 *
 * Uso nas rotas:
 *   canActivate: [authGuard]
 *   data: { roles: ['ADMIN', 'CIMENTACAO'] }  // opcional — omitir para qualquer autenticado
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

  const requiredRoles = normalizarRoles(route.data['roles']);

  if (requiredRoles && requiredRoles.length > 0) {
    const currentUser = store.selectSnapshot(AuthState.currentUser);
    const userRoles = obterRolesUsuario(currentUser);

    if (!userRoles.some((role) => requiredRoles.includes(role))) {
      return router.createUrlTree(['/acesso-negado']);
    }
  }

  return true;
};

function obterRolesUsuario(user: AuthenticatedUser | null): UserRole[] {
  return normalizarRoles([...(user?.roles ?? []), user?.role].filter(Boolean) as string[]);
}

function normalizarRoles(roles: string[] | undefined): UserRole[] {
  return Array.from(
    new Set(
      (roles ?? [])
        .map((role) => role.replace(/^ROLE_/i, '').toUpperCase())
        .filter(Boolean),
    ),
  ) as UserRole[];
}
