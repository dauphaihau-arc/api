import type { HttpException } from '@nestjs/common';
import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException
} from '@nestjs/common';
import {
  AuthAppError,
  EmailAlreadyRegisteredError,
  InactiveUserError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshSessionInactiveError,
  RefreshSessionNotFoundError,
  RefreshTokenMismatchError,
  SessionNotActiveError,
  UserNotFoundError
} from '../../app/errors/auth-app.error';

export function isAuthAppError(error: unknown): error is AuthAppError {
  return error instanceof AuthAppError;
}

export function mapAuthAppErrorToHttpException(
  error: AuthAppError
): HttpException {
  if (
    error instanceof InvalidCredentialsError
    || error instanceof SessionNotActiveError
    || error instanceof UserNotFoundError
    || error instanceof InvalidRefreshTokenError
    || error instanceof RefreshSessionNotFoundError
    || error instanceof RefreshSessionInactiveError
    || error instanceof RefreshTokenMismatchError
  ) {
    return new UnauthorizedException(error.message);
  }

  if (error instanceof InactiveUserError) {
    return new ForbiddenException(error.message);
  }

  if (error instanceof EmailAlreadyRegisteredError) {
    return new ConflictException(error.message);
  }

  return new UnauthorizedException(error.message);
}
