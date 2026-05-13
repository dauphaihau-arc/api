import type { UserStatus } from '../../domain/enums/user-status.enum';
import type { RoleDefinition } from '../../domain/models/role-definition';
import type { UserAccount } from '../../domain/models/user-account';
import type { Email } from '../../domain/value-objects/email';
import type { PasswordHash } from '../../domain/value-objects/password-hash';
import type { RoleKey } from '../../domain/value-objects/role-key';

export interface CreateUserAccountInput {
  email: Email;
  displayName?: string;
  status: UserStatus;
  passwordHash: PasswordHash;
  passwordUpdatedAt: Date;
  emailVerifiedAt?: Date;
}

export interface UpdateUserAccountInput {
  version: number;
  displayName?: string;
  avatar?: string;
  status?: UserStatus;
}

export class UserAccountVersionConflictError extends Error {
  constructor() {
    super('User version does not match the latest persisted state');
  }
}

export abstract class AuthUserRepository {
  abstract findByEmail(email: Email): Promise<UserAccount | null>;
  abstract findById(id: string): Promise<UserAccount | null>;
  abstract create(input: CreateUserAccountInput): Promise<UserAccount>;
  abstract update(id: string, input: UpdateUserAccountInput): Promise<UserAccount | null>;
  abstract assignRole(userId: string, roleKey: RoleKey): Promise<void>;
  abstract ensureRole(role: RoleDefinition): Promise<void>;
}
