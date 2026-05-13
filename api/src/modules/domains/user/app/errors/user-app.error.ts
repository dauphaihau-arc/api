import { DomainError } from '~/common/errors/domain.error';

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
