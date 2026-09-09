import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Store } from '@ngxs/store';

import { AuthState } from '../../features/auth/state/auth.state';
import { SessionExpired } from '../../features/auth/state/auth.actions';
import { environment } from '../../../environments/environment';

export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const store = inject(Store);
  const token = store.selectSnapshot(AuthState.token);

  const apiPrefix = `${environment.apiUrl}/api/`;
  const isApiRequest = request.url.startsWith(apiPrefix);
  const isPublicAuth = request.url.split('?')[0].startsWith(`${apiPrefix}auth/`);
  const usesSession = isApiRequest && !isPublicAuth;

  const req = token && usesSession
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(req).pipe(
    catchError((error) => {
      if (error?.status === 401 && token && usesSession) {
        store.dispatch(new SessionExpired());
      }
      return throwError(() => error);
    }),
  );
};
