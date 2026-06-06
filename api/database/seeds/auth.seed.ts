import type { EntityManager } from '@mikro-orm/postgresql';
import * as path from 'node:path';
import { buildAuthConfig } from '~/config/auth.config';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import { CurrentUserCredentialEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user-credential.entity';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { PermissionEntity } from '~/modules/domains/auth/infra/persistence/entities/permission.entity';
import { RoleEntity } from '~/modules/domains/auth/infra/persistence/entities/role.entity';
import { RolePermissionEntity } from '~/modules/domains/auth/infra/persistence/entities/role-permission.entity';
import { UserRoleEntity } from '~/modules/domains/auth/infra/persistence/entities/user-role.entity';
import { BcryptPasswordHasher } from '~/modules/domains/auth/infra/security/bcrypt-password-hasher';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

type UserSeed = {
  email: string;
  displayName: string;
  password: string;
  roleKey: string;
  emailVerified: boolean;
};

type RoleSeed = {
  key: string;
  name: string;
  description?: string;
};

type PermissionSeed = {
  key: string;
  name: string;
  description?: string;
};

type RolePermissionSeed = {
  roleKey: string;
  permissionKey: string;
};

type RoleCsvRow = {
  key: string;
  name: string;
  description: string;
};

type PermissionCsvRow = {
  key: string;
  name: string;
  description: string;
};

type RolePermissionCsvRow = {
  role_key: string;
  permission_key: string;
};

type UserCsvRow = {
  email: string;
  display_name: string;
  password: string;
  role_key: string;
  email_verified: string;
};

const ROLES_TSV_PATH = path.resolve(__dirname, '../../../seed-data/auth-roles.tsv');
const PERMISSIONS_TSV_PATH = path.resolve(__dirname, '../../../seed-data/auth-permissions.tsv');
const ROLE_PERMISSIONS_TSV_PATH = path.resolve(
  __dirname,
  '../../../seed-data/auth-role-permissions.tsv'
);
const USERS_TSV_PATH = path.resolve(__dirname, '../../../seed-data/auth-users.tsv');
const USERS_LOCAL_TSV_PATH = path.resolve(__dirname, '../../../seed-data/auth-users.local.tsv');

function parseBoolean(value: string, filePath: string, rowNumber: number): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  throw new Error(`Invalid boolean "${value}" in ${filePath} row ${rowNumber}`);
}

const roles: RoleSeed[] = readTsvRows<RoleCsvRow>(ROLES_TSV_PATH).map((row, index) => ({
  key: row.key.trim(),
  name: row.name.trim(),
  description: row.description.trim() || undefined,
}));

const permissions: PermissionSeed[] = readTsvRows<PermissionCsvRow>(PERMISSIONS_TSV_PATH).map(
  (row) => ({
    key: row.key.trim(),
    name: row.name.trim(),
    description: row.description.trim() || undefined,
  })
);

const rolePermissionSeeds: RolePermissionSeed[] =
  readTsvRows<RolePermissionCsvRow>(ROLE_PERMISSIONS_TSV_PATH).map((row) => ({
    roleKey: row.role_key.trim(),
    permissionKey: row.permission_key.trim(),
  }));

const userSeeds: UserSeed[] = [
  ...readTsvRows<UserCsvRow>(USERS_TSV_PATH).map((row, index) => ({
    email: row.email.trim(),
    displayName: row.display_name.trim(),
    password: row.password,
    roleKey: row.role_key.trim(),
    emailVerified: parseBoolean(row.email_verified, USERS_TSV_PATH, index + 2),
  })),
  ...readOptionalTsvRows<UserCsvRow>(USERS_LOCAL_TSV_PATH).map((row, index) => ({
    email: row.email.trim(),
    displayName: row.display_name.trim(),
    password: row.password,
    roleKey: row.role_key.trim(),
    emailVerified: parseBoolean(row.email_verified, USERS_LOCAL_TSV_PATH, index + 2),
  })),
];

export async function seedAuth(
  em: EntityManager
): Promise<{ usersByEmail: Map<string, CurrentUserEntity> }> {
  const { roleByKey } = await seedAuthReferenceData(em);
  const passwordService = new BcryptPasswordHasher(
    buildAuthConfig({
      get(key: string) {
        return process.env[key];
      },
    })
  );

  const usersByEmail = new Map<string, CurrentUserEntity>();
  for (const userSeed of userSeeds) {
    let user = await em.findOne(
      CurrentUserEntity,
      { email: userSeed.email },
      { populate: ['credential'] }
    );

    if (!user) {
      user = em.create(CurrentUserEntity, {
        email: userSeed.email,
        displayName: userSeed.displayName,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: userSeed.emailVerified ? new Date() : undefined,
      });
      em.persist(user);
      await em.flush();
    } else {
      user.displayName = userSeed.displayName;
      user.status = UserStatus.ACTIVE;
      user.emailVerifiedAt = userSeed.emailVerified ? new Date() : undefined;
    }

    const passwordHash = await passwordService.hash(userSeed.password);
    if (!user.credential) {
      user.credential = em.create(CurrentUserCredentialEntity, {
        user,
        passwordHash,
        passwordUpdatedAt: new Date(),
      });
      em.persist(user.credential);
    } else {
      user.credential.passwordHash = passwordHash;
      user.credential.passwordUpdatedAt = new Date();
    }

    const role = roleByKey.get(userSeed.roleKey);
    if (!role) {
      throw new Error(`Missing role for user seed: ${userSeed.roleKey}`);
    }

    const existingUserRole = await em.findOne(UserRoleEntity, { user, role });
    if (!existingUserRole) {
      em.persist(
        em.create(UserRoleEntity, {
          user,
          role,
          assignedAt: new Date(),
        })
      );
    }

    usersByEmail.set(user.email, user);
    em.persist(user);
    await em.flush();
  }

  return { usersByEmail };
}

export async function seedAuthReferenceData(
  em: EntityManager
): Promise<{
  roleByKey: Map<string, RoleEntity>;
  permissionByKey: Map<string, PermissionEntity>;
}> {
  const roleByKey = new Map<string, RoleEntity>();
  for (const roleSeed of roles) {
    const role =
      (await em.findOne(RoleEntity, { key: roleSeed.key })) ??
      em.create(RoleEntity, roleSeed);

    role.name = roleSeed.name;
    role.description = roleSeed.description;
    roleByKey.set(role.key, role);
    em.persist(role);
  }

  const permissionByKey = new Map<string, PermissionEntity>();
  for (const permissionSeed of permissions) {
    const permission =
      (await em.findOne(PermissionEntity, { key: permissionSeed.key })) ??
      em.create(PermissionEntity, permissionSeed);

    permission.name = permissionSeed.name;
    permission.description = permissionSeed.description;
    permissionByKey.set(permission.key, permission);
    em.persist(permission);
  }

  await em.flush();

  for (const rolePermissionSeed of rolePermissionSeeds) {
    const role = roleByKey.get(rolePermissionSeed.roleKey);

    if (!role) {
      throw new Error(`Missing seed role: ${rolePermissionSeed.roleKey}`);
    }

    const permission = permissionByKey.get(rolePermissionSeed.permissionKey);

    if (!permission) {
      throw new Error(`Missing seed permission: ${rolePermissionSeed.permissionKey}`);
    }

    const existing = await em.findOne(RolePermissionEntity, { role, permission });
    if (!existing) {
      em.persist(
        em.create(RolePermissionEntity, {
          role,
          permission,
          grantedAt: new Date(),
        })
      );
    }
  }

  await em.flush();

  return { roleByKey, permissionByKey };
}
