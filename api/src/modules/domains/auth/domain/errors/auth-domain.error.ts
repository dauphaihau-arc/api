import { DomainError } from '~/common/errors/domain.error';

export abstract class AuthDomainError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class EmailRequiredError extends AuthDomainError {
  constructor() {
    super('Email is required');
  }
}

export class InvalidEmailError extends AuthDomainError {
  constructor() {
    super('Email is invalid');
  }
}

export class PasswordHashRequiredError extends AuthDomainError {
  constructor() {
    super('Password hash is required');
  }
}

export class UnsupportedPasswordHashFormatError extends AuthDomainError {
  constructor() {
    super('Unsupported password hash format');
  }
}

export class PermissionKeyRequiredError extends AuthDomainError {
  constructor() {
    super('Permission key is required');
  }
}

export class InvalidPermissionKeyError extends AuthDomainError {
  constructor() {
    super('Permission key is invalid');
  }
}

export class RoleKeyRequiredError extends AuthDomainError {
  constructor() {
    super('Role key is required');
  }
}

export class InvalidRoleKeyError extends AuthDomainError {
  constructor() {
    super('Role key is invalid');
  }
}
