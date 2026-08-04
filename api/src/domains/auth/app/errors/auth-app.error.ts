import { DomainError } from '~/platform/errors/domain.error';

export abstract class AuthAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class InvalidCredentialsError extends AuthAppError {
  constructor() {
    super('Invalid email or password');
  }
}

export class InactiveUserError extends AuthAppError {
  constructor() {
    super('User account is not active');
  }
}

export class AuthPortalAccessDeniedError extends AuthAppError {
  constructor() {
    super('This account cannot access this portal');
  }
}

export class EmailAlreadyRegisteredError extends AuthAppError {
  constructor() {
    super('Email is already registered');
  }
}

export class SessionNotActiveError extends AuthAppError {
  constructor() {
    super('Session is not active');
  }
}

export class UserNotFoundError extends AuthAppError {
  constructor() {
    super('User was not found');
  }
}

export class InvalidRefreshTokenError extends AuthAppError {
  constructor() {
    super('Invalid refresh token');
  }
}

export class RefreshSessionNotFoundError extends AuthAppError {
  constructor() {
    super('Refresh session was not found');
  }
}

export class RefreshSessionInactiveError extends AuthAppError {
  constructor() {
    super('Refresh session is no longer active');
  }
}

export class RefreshTokenMismatchError extends AuthAppError {
  constructor() {
    super('Refresh token does not match session');
  }
}

export class InvalidPasswordResetTokenError extends AuthAppError {
  constructor() {
    super('Invalid password reset token');
  }
}

export class PasswordResetTokenExpiredError extends AuthAppError {
  constructor() {
    super('Password reset token has expired');
  }
}
