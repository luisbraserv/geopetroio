import { AuthenticatedUser } from '../models/user.model';

export class Login {
  static readonly type = '[Auth] Login';
  constructor(public payload: { username: string; password: string }) {}
}

export class LoginSuccess {
  static readonly type = '[Auth] Login Success';
  constructor(public user: AuthenticatedUser) {}
}

export class LoginFailure {
  static readonly type = '[Auth] Login Failure';
  constructor(public error: string) {}
}

export class UpdateAuthenticatedUser {
  static readonly type = '[Auth] Update Authenticated User';
  constructor(public user: AuthenticatedUser) {}
}

export class Logout {
  static readonly type = '[Auth] Logout';
}

export class ClearAuthError {
  static readonly type = '[Auth] Clear Error';
}

export class SessionExpired {
  static readonly type = '[Auth] Session Expired';
}
