import type { HttpException } from '@nestjs/common';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthPortalAccessDeniedError,
  AuthAppError,
  EmailAlreadyRegisteredError,
  InactiveUserError,
  InvalidCredentialsError,
  InvalidPasswordResetTokenError,
  InvalidRefreshTokenError,
  PasswordResetTokenExpiredError,
  RefreshSessionInactiveError,
  RefreshSessionNotFoundError,
  RefreshTokenMismatchError,
  SessionNotActiveError,
  UserNotFoundError,
} from '../../../app/errors/auth-app.error';

type AuthHttpErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'SESSION_NOT_ACTIVE'
  | 'USER_NOT_FOUND'
  | 'INVALID_REFRESH_TOKEN'
  | 'REFRESH_SESSION_NOT_FOUND'
  | 'REFRESH_SESSION_INACTIVE'
  | 'REFRESH_TOKEN_MISMATCH'
  | 'INVALID_PASSWORD_RESET_TOKEN'
  | 'PASSWORD_RESET_TOKEN_EXPIRED'
  | 'INACTIVE_USER'
  | 'PORTAL_ACCESS_DENIED'
  | 'EMAIL_ALREADY_REGISTERED';

export function isAuthAppError(error: unknown): error is AuthAppError {
  return error instanceof AuthAppError;
}

export function mapAuthAppErrorToHttpException(
  error: AuthAppError,
): HttpException {
  if (
    error instanceof InvalidCredentialsError
    || error instanceof SessionNotActiveError
    || error instanceof UserNotFoundError
    || error instanceof InvalidRefreshTokenError
    || error instanceof InvalidPasswordResetTokenError
    || error instanceof PasswordResetTokenExpiredError
    || error instanceof RefreshSessionNotFoundError
    || error instanceof RefreshSessionInactiveError
    || error instanceof RefreshTokenMismatchError
  ) {
    return new UnauthorizedException({
      code: getAuthErrorCode(error),
      message: error.message,
    });
  }

  if (
    error instanceof InactiveUserError
    || error instanceof AuthPortalAccessDeniedError
  ) {
    return new ForbiddenException({
      code: getAuthErrorCode(error),
      message: error.message,
    });
  }

  if (error instanceof EmailAlreadyRegisteredError) {
    return new ConflictException({
      code: 'EMAIL_ALREADY_REGISTERED',
      message: error.message,
    });
  }

  return new UnauthorizedException({
    code: getAuthErrorCode(error),
    message: error.message,
  });
}

function getAuthErrorCode(error: AuthAppError): AuthHttpErrorCode {
  if (error instanceof InvalidCredentialsError) {
    return 'INVALID_CREDENTIALS';
  }
  if (error instanceof SessionNotActiveError) {
    return 'SESSION_NOT_ACTIVE';
  }
  if (error instanceof UserNotFoundError) {
    return 'USER_NOT_FOUND';
  }
  if (error instanceof InvalidRefreshTokenError) {
    return 'INVALID_REFRESH_TOKEN';
  }
  if (error instanceof RefreshSessionNotFoundError) {
    return 'REFRESH_SESSION_NOT_FOUND';
  }
  if (error instanceof RefreshSessionInactiveError) {
    return 'REFRESH_SESSION_INACTIVE';
  }
  if (error instanceof RefreshTokenMismatchError) {
    return 'REFRESH_TOKEN_MISMATCH';
  }
  if (error instanceof InvalidPasswordResetTokenError) {
    return 'INVALID_PASSWORD_RESET_TOKEN';
  }
  if (error instanceof PasswordResetTokenExpiredError) {
    return 'PASSWORD_RESET_TOKEN_EXPIRED';
  }
  if (error instanceof InactiveUserError) {
    return 'INACTIVE_USER';
  }
  if (error instanceof AuthPortalAccessDeniedError) {
    return 'PORTAL_ACCESS_DENIED';
  }
  return 'INVALID_CREDENTIALS';
}
