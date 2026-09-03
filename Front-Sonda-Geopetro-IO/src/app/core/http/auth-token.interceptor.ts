import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Store } from '@ngxs/store';

import { AuthState } from '../../features/auth/state/auth.state';
import { SessionExpired } from '../../features/auth/state/auth.actions';

export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const store = inject(Store);
  const token = store.selectSnapshot(AuthState.token);

  const req = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(req).pipe(
    catchError((error) => {
      if (error?.status === 401) {
        store.dispatch(new SessionExpired());
      }
      return throwError(() => error);
    }),
  );
};
