import type { HttpException } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorNotAllowedToAssignRolesError,
  ActorNotAllowedToCreateUsersError,
  ActorNotAllowedToUpdateUsersError,
  LastAdminRoleRequiredError,
  LastSuperAdminRoleRequiredError,
  SelfRoleChangeNotAllowedError,
  UnknownRoleKeysError,
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

  if (error instanceof ActorNotAllowedToAssignRolesError) {
    return new ForbiddenException({
      code: 'ACTOR_NOT_ALLOWED_TO_ASSIGN_ROLES',
      message: error.message,
    });
  }

  if (error instanceof UnknownRoleKeysError) {
    return new BadRequestException({
      code: 'UNKNOWN_ROLE',
      message: error.message,
    });
  }

  if (error instanceof SelfRoleChangeNotAllowedError) {
    return new ConflictException({
      code: 'SELF_ROLE_CHANGE_NOT_ALLOWED',
      message: error.message,
    });
  }

  if (error instanceof LastAdminRoleRequiredError) {
    return new ConflictException({
      code: 'LAST_ADMIN_ROLE_REQUIRED',
      message: error.message,
    });
  }

  if (error instanceof LastSuperAdminRoleRequiredError) {
    return new ConflictException({
      code: 'LAST_SUPER_ADMIN_ROLE_REQUIRED',
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
