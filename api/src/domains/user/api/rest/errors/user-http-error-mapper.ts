import type { HttpException } from '@nestjs/common';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorNotAllowedToCreateUsersError,
  ActorNotAllowedToUpdateUsersError,
  UserAppError,
  UserEmailAlreadyRegisteredError,
  UserNotFoundError,
  UserVersionConflictError,
} from '../../../app/errors/user-app.error';

export function isUserAppError(error: unknown): error is UserAppError {
  return error instanceof UserAppError;
}

export function mapUserAppErrorToHttpException(
  error: UserAppError,
): HttpException {
  if (error instanceof ActorNotAllowedToCreateUsersError) {
    return new ForbiddenException({
      code: 'ACTOR_NOT_ALLOWED_TO_CREATE_USERS',
      message: error.message,
    });
  }

  if (error instanceof ActorNotAllowedToUpdateUsersError) {
    return new ForbiddenException({
      code: 'ACTOR_NOT_ALLOWED_TO_UPDATE_USERS',
      message: error.message,
    });
  }

  if (error instanceof UserEmailAlreadyRegisteredError) {
    return new ConflictException({
      code: 'EMAIL_ALREADY_REGISTERED',
      message: error.message,
    });
  }

  if (error instanceof UserVersionConflictError) {
    return new ConflictException({
      code: 'USER_VERSION_CONFLICT',
      message: error.message,
    });
  }

  if (error instanceof UserNotFoundError) {
    return new NotFoundException({
      code: 'USER_NOT_FOUND',
      message: error.message,
    });
  }

  return new ForbiddenException({
    code: 'USER_OPERATION_FORBIDDEN',
    message: error.message,
  });
}
