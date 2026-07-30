import type { UserStatus } from '../enums/user-status.enum';
import type { Email } from '../value-objects/email';
import type { PasswordHash } from '../value-objects/password-hash';
import type { PermissionKey } from '../value-objects/permission-key';
import type { RoleKey } from '../value-objects/role-key';

export interface UserAccount {
  id: string;
  version: number;
  email: Email;
  displayName?: string;
  avatar?: string;
  status: UserStatus;
  emailVerifiedAt?: Date;
  passwordHash?: PasswordHash;
  passwordUpdatedAt?: Date;
  roles: RoleKey[];
  permissions: PermissionKey[];
}
