import type { HttpException } from '@nestjs/common';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import {
  ActorNotAllowedToCreateUsersError,
  ActorNotAllowedToUpdateUsersError,
  UserAppError,
  UserEmailAlreadyRegisteredError,
  UserNotFoundError,
  UserVersionConflictError
} from '../../app/errors/user-app.error';

export function isUserAppError(error: unknown): error is UserAppError {
  return error instanceof UserAppError;
}

export function mapUserAppErrorToHttpException(
  error: UserAppError
): HttpException {
  if (error instanceof ActorNotAllowedToCreateUsersError) {
    return new ForbiddenException(error.message);
  }

  if (error instanceof ActorNotAllowedToUpdateUsersError) {
    return new ForbiddenException(error.message);
  }

  if (error instanceof UserEmailAlreadyRegisteredError) {
    return new ConflictException(error.message);
  }

  if (error instanceof UserVersionConflictError) {
    return new ConflictException(error.message);
  }

  if (error instanceof UserNotFoundError) {
    return new NotFoundException(error.message);
  }

  return new ForbiddenException(error.message);
}
