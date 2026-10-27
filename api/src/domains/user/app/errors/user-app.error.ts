import { DomainError } from '~/platform/errors/domain.error';

export abstract class UserAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class ActorNotAllowedToCreateUsersError extends UserAppError {
  constructor() {
    super('Only admins can create users');
  }
}

export class ActorNotAllowedToUpdateUsersError extends UserAppError {
  constructor() {
    super('Only admins can update users');
  }
}

export class ActorNotAllowedToAssignRolesError extends UserAppError {
  constructor() {
    super('Only admins can assign user roles');
  }
}

export class UnknownRoleKeysError extends UserAppError {
  constructor(readonly roleKeys: string[]) {
    super(`Unknown role keys: ${roleKeys.join(', ')}`);
  }
}

export class SelfRoleChangeNotAllowedError extends UserAppError {
  constructor() {
    super('Actors cannot change their own roles');
  }
}

export class LastAdminRoleRequiredError extends UserAppError {
  constructor() {
    super('At least one user must keep the admin role');
  }
}

export class LastSuperAdminRoleRequiredError extends UserAppError {
  constructor() {
    super('At least one user must keep the super admin role');
  }
}

export class UserEmailAlreadyRegisteredError extends UserAppError {
  constructor() {
    super('Email is already registered');
  }
}

export class UserNotFoundError extends UserAppError {
  constructor() {
    super('User was not found');
  }
}

export class UserVersionConflictError extends UserAppError {
  constructor() {
    super('User was updated by another request. Refresh and retry with the latest version.');
  }
}
