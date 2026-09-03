import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { Action, Selector, State, StateContext } from '@ngxs/store';

import { AuthenticatedUser, normalizarRoles, rotaInicialPara } from '../models/user.model';
import { AuthService } from '../services/auth.service';
import {
  ClearAuthError,
  Login,
  LoginFailure,
  LoginSuccess,
  Logout,
  SessionExpired,
  UpdateAuthenticatedUser,
} from './auth.actions';

export interface AuthStateModel {
  user: AuthenticatedUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

@State<AuthStateModel>({
  name: 'auth',
  defaults: {
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  },
})
@Injectable()
export class AuthState {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  @Selector()
  static isAuthenticated(state: AuthStateModel): boolean {
    return state.isAuthenticated;
  }

  @Selector()
  static currentUser(state: AuthStateModel): AuthenticatedUser | null {
    return state.user;
  }

  @Selector()
  static token(state: AuthStateModel): string | null {
    return state.token;
  }

  @Selector()
  static authError(state: AuthStateModel): string | null {
    return state.error;
  }

  @Selector()
  static isLoading(state: AuthStateModel): boolean {
    return state.isLoading;
  }

  @Action(Login)
  login(ctx: StateContext<AuthStateModel>, action: Login): Observable<void> {
    ctx.patchState({ isLoading: true, error: null });

    return this.authService
      .authenticate$(action.payload.username, action.payload.password)
      .pipe(
        map((user) => {
          ctx.dispatch(new LoginSuccess(user));
        }),
        catchError((error: Error) => {
          ctx.dispatch(new LoginFailure(error.message));
          return of(undefined);
        }),
      );
  }

  @Action(LoginSuccess)
  loginSuccess(
    ctx: StateContext<AuthStateModel>,
    action: LoginSuccess,
  ): void {
    ctx.patchState({
      user: action.user,
      token: action.user.token,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    this.router.navigate([rotaInicial(action.user)]);
  }

  @Action(LoginFailure)
  loginFailure(
    ctx: StateContext<AuthStateModel>,
    action: LoginFailure,
  ): void {
    ctx.patchState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: action.error,
    });
  }

  @Action(UpdateAuthenticatedUser)
  updateAuthenticatedUser(
    ctx: StateContext<AuthStateModel>,
    action: UpdateAuthenticatedUser,
  ): void {
    const state = ctx.getState();
    ctx.patchState({
      user: {
        ...action.user,
        token: state.token ?? action.user.token,
      },
    });
  }

  @Action(Logout)
  logout(ctx: StateContext<AuthStateModel>): void {
    ctx.patchState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    this.router.navigate(['/login']);
  }

  @Action(SessionExpired)
  sessionExpired(ctx: StateContext<AuthStateModel>): void {
    ctx.patchState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: 'Necessário refazer login',
    });
    this.router.navigate(['/login']);
  }

  @Action(ClearAuthError)
  clearError(ctx: StateContext<AuthStateModel>): void {
    ctx.patchState({ error: null });
  }
}

function rotaInicial(user: AuthenticatedUser): string {
  return rotaInicialPara(normalizarRoles([...(user.roles ?? []), user.role]));
}
