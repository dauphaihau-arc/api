import {
  EmailRequiredError,
  InvalidEmailError,
  InvalidPermissionKeyError,
  InvalidRoleKeyError,
  PasswordHashRequiredError,
  PermissionKeyRequiredError,
  RoleKeyRequiredError,
  UnsupportedPasswordHashFormatError,
} from '../errors/auth-domain.error';
import { Email } from './email';
import { PasswordHash } from './password-hash';
import { PermissionKey } from './permission-key';
import { RoleKey } from './role-key';

describe('auth domain value objects', () => {
  it('throws typed domain errors for invalid emails', () => {
    expect(() => Email.create('   ')).toThrow(EmailRequiredError);
    expect(() => Email.create('invalid-email')).toThrow(InvalidEmailError);
  });

  it('throws typed domain errors for invalid password hashes', () => {
    expect(() => PasswordHash.fromPersisted('')).toThrow(
      PasswordHashRequiredError,
    );
    expect(() => PasswordHash.fromPersisted('plain-text')).toThrow(
      UnsupportedPasswordHashFormatError,
    );
  });

  it('throws typed domain errors for invalid permission keys', () => {
    expect(() => PermissionKey.create('')).toThrow(PermissionKeyRequiredError);
    expect(() => PermissionKey.create('123invalid')).toThrow(
      InvalidPermissionKeyError,
    );
  });

  it('throws typed domain errors for invalid role keys', () => {
    expect(() => RoleKey.create('')).toThrow(RoleKeyRequiredError);
    expect(() => RoleKey.create('123invalid')).toThrow(InvalidRoleKeyError);
  });
});
