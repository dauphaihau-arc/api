import type { EntityManager } from '@mikro-orm/postgresql';
import * as path from 'node:path';
import { buildAuthConfig } from '~/platform/config/auth.config';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { UserCredentialEntity } from '~/domains/auth/infra/persistence/entities/user-credential.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { UserRoleEntity } from '~/domains/auth/infra/persistence/entities/user-role.entity';
import { BcryptPasswordHasher } from '~/domains/auth/infra/security/bcrypt-password-hasher';
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
  '../../../seed-data/auth-role-permissions.tsv',
);
const USERS_TSV_PATH = path.resolve(__dirname, '../../../seed-data/auth-users.tsv');
const USERS_LOCAL_TSV_PATH = path.resolve(__dirname, '../../../seed-data/auth-users.local.tsv');

function resolveProgressInterval(total: number, maxSteps = 5): number {
  return Math.max(1, Math.ceil(total / maxSteps));
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

function resolveSeedBcryptSaltRounds(defaultRounds: number): number {
  const configuredRounds = Number(process.env.SEED_BCRYPT_SALT_ROUNDS ?? '4');

  if (Number.isFinite(configuredRounds) && configuredRounds > 0) {
    return configuredRounds;
  }

  return Math.min(defaultRounds, 4);
}

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

const roles: RoleSeed[] = readTsvRows<RoleCsvRow>(ROLES_TSV_PATH).map((row) => ({
  key: row.key.trim(),
  name: row.name.trim(),
  description: row.description.trim() || undefined,
}));

const permissions: PermissionSeed[] = readTsvRows<PermissionCsvRow>(PERMISSIONS_TSV_PATH).map(
  (row) => ({
    key: row.key.trim(),
    name: row.name.trim(),
    description: row.description.trim() || undefined,
  }),
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
  em: EntityManager,
): Promise<{ usersByEmail: Map<string, UserEntity> }> {
  const { roleByKey } = await seedAuthReferenceData(em);
  const authConfig = buildAuthConfig({
    get(key: string) {
      return process.env[key];
    },
  });
  const seedBcryptSaltRounds = resolveSeedBcryptSaltRounds(authConfig.bcryptSaltRounds);
  const passwordService = new BcryptPasswordHasher({
    ...authConfig,
    bcryptSaltRounds: seedBcryptSaltRounds,
  });

  const userEmails = userSeeds.map((userSeed) => userSeed.email);
  const passwordHashByRawPassword = new Map<string, Promise<string>>();
  const uniquePasswords = new Set(userSeeds.map((userSeed) => userSeed.password));
  const existingUsers = await em.find(
    UserEntity,
    { email: { $in: userEmails } },
  );
  const existingUsersByEmail = new Map(existingUsers.map((user) => [user.email, user]));
  const progressInterval = resolveProgressInterval(userSeeds.length);
  const usersStartedAt = Date.now();

  console.log(
    `[seed][auth] Upserting ${userSeeds.length} users with ${uniquePasswords.size} unique password(s) at bcrypt rounds ${seedBcryptSaltRounds}`,
  );

  const usersByEmail = new Map<string, UserEntity>();
  for (const [index, userSeed] of userSeeds.entries()) {
    let user = existingUsersByEmail.get(userSeed.email);

    if (!user) {
      user = em.create(UserEntity, {
        version: 1,
        email: userSeed.email,
        displayName: userSeed.displayName,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: userSeed.emailVerified ? new Date() : undefined,
      });
      existingUsersByEmail.set(user.email, user);
    }
    else {
      user.displayName = userSeed.displayName;
      user.status = UserStatus.ACTIVE;
      user.emailVerifiedAt = userSeed.emailVerified ? new Date() : undefined;
    }

    usersByEmail.set(user.email, user);
    em.persist(user);

    if ((index + 1) % progressInterval === 0 || index + 1 === userSeeds.length) {
      console.log(
        `[seed][auth] Processed ${index + 1}/${userSeeds.length} users in ${formatDuration(Date.now() - usersStartedAt)}`,
      );
    }
  }

  await em.flush();

  const seededUsers = Array.from(usersByEmail.values());
  const existingCredentials = await em.find(UserCredentialEntity, {
    userId: { $in: seededUsers.map((user) => user.id) },
  });
  const existingCredentialByUserId = new Map(
    existingCredentials.map((credential) => [credential.userId, credential]),
  );
  const existingUserRoles = await em.find(
    UserRoleEntity,
    { user: { email: { $in: userEmails } } },
    { populate: ['user', 'role'] },
  );
  const existingUserRoleKeys = new Set(
    existingUserRoles.map((userRole) => `${userRole.user.email}::${userRole.role.key}`),
  );

  for (const userSeed of userSeeds) {
    const user = usersByEmail.get(userSeed.email);

    if (!user) {
      throw new Error(`Missing user for auth seed: ${userSeed.email}`);
    }

    let passwordHashPromise = passwordHashByRawPassword.get(userSeed.password);

    if (!passwordHashPromise) {
      passwordHashPromise = passwordService.hash(userSeed.password);
      passwordHashByRawPassword.set(userSeed.password, passwordHashPromise);
    }

    const passwordHash = await passwordHashPromise;
    const credential = existingCredentialByUserId.get(user.id);
    if (!credential) {
      const newCredential = em.create(UserCredentialEntity, {
        userId: user.id,
        passwordHash,
        passwordUpdatedAt: new Date(),
      });
      existingCredentialByUserId.set(user.id, newCredential);
      em.persist(newCredential);
    }
    else {
      credential.passwordHash = passwordHash;
      credential.passwordUpdatedAt = new Date();
    }

    const role = roleByKey.get(userSeed.roleKey);
    if (!role) {
      throw new Error(`Missing role for user seed: ${userSeed.roleKey}`);
    }

    const userRoleKey = `${user.email}::${role.key}`;
    if (!existingUserRoleKeys.has(userRoleKey)) {
      em.persist(
        em.create(UserRoleEntity, {
          user,
          role,
          assignedAt: new Date(),
        }),
      );
      existingUserRoleKeys.add(userRoleKey);
    }
  }

  await em.flush();

  return { usersByEmail };
}

export async function seedAuthReferenceData(
  em: EntityManager,
): Promise<{
  roleByKey: Map<string, RoleEntity>;
  permissionByKey: Map<string, PermissionEntity>;
}> {
  console.log(
    `[seed][auth] Upserting ${roles.length} roles, ${permissions.length} permissions, and ${rolePermissionSeeds.length} role-permission links`,
  );
  const rolesStartedAt = Date.now();

  const roleKeys = roles.map((roleSeed) => roleSeed.key);
  const existingRoles = await em.find(RoleEntity, { key: { $in: roleKeys } });
  const existingRolesByKey = new Map(existingRoles.map((role) => [role.key, role]));
  const roleByKey = new Map<string, RoleEntity>();
  const roleProgressInterval = resolveProgressInterval(roles.length);
  for (const [index, roleSeed] of roles.entries()) {
    const role = existingRolesByKey.get(roleSeed.key) ?? em.create(RoleEntity, roleSeed);

    role.name = roleSeed.name;
    role.description = roleSeed.description;
    roleByKey.set(role.key, role);
    em.persist(role);

    if ((index + 1) % roleProgressInterval === 0 || index + 1 === roles.length) {
      console.log(
        `[seed][auth] Processed ${index + 1}/${roles.length} roles in ${formatDuration(Date.now() - rolesStartedAt)}`,
      );
    }
  }

  const permissionKeys = permissions.map((permissionSeed) => permissionSeed.key);
  const permissionsStartedAt = Date.now();
  const existingPermissions = await em.find(PermissionEntity, {
    key: { $in: permissionKeys },
  });
  const existingPermissionsByKey = new Map(
    existingPermissions.map((permission) => [permission.key, permission]),
  );
  const permissionByKey = new Map<string, PermissionEntity>();
  const permissionProgressInterval = resolveProgressInterval(permissions.length);
  for (const [index, permissionSeed] of permissions.entries()) {
    const permission =
      existingPermissionsByKey.get(permissionSeed.key) ??
      em.create(PermissionEntity, permissionSeed);

    permission.name = permissionSeed.name;
    permission.description = permissionSeed.description;
    permissionByKey.set(permission.key, permission);
    em.persist(permission);

    if ((index + 1) % permissionProgressInterval === 0 || index + 1 === permissions.length) {
      console.log(
        `[seed][auth] Processed ${index + 1}/${permissions.length} permissions in ${formatDuration(Date.now() - permissionsStartedAt)}`,
      );
    }
  }

  await em.flush();

  const existingRolePermissions = await em.find(
    RolePermissionEntity,
    {
      role: { key: { $in: roleKeys } },
      permission: { key: { $in: permissionKeys } },
    },
    { populate: ['role', 'permission'] },
  );
  const existingRolePermissionKeys = new Set(
    existingRolePermissions.map(
      (rolePermission) => `${rolePermission.role.key}::${rolePermission.permission.key}`,
    ),
  );

  const rolePermissionProgressInterval = resolveProgressInterval(rolePermissionSeeds.length);
  const rolePermissionsStartedAt = Date.now();
  for (const [index, rolePermissionSeed] of rolePermissionSeeds.entries()) {
    const role = roleByKey.get(rolePermissionSeed.roleKey);

    if (!role) {
      throw new Error(`Missing seed role: ${rolePermissionSeed.roleKey}`);
    }

    const permission = permissionByKey.get(rolePermissionSeed.permissionKey);

    if (!permission) {
      throw new Error(`Missing seed permission: ${rolePermissionSeed.permissionKey}`);
    }

    const rolePermissionKey = `${role.key}::${permission.key}`;
    if (!existingRolePermissionKeys.has(rolePermissionKey)) {
      em.persist(
        em.create(RolePermissionEntity, {
          role,
          permission,
          grantedAt: new Date(),
        }),
      );
      existingRolePermissionKeys.add(rolePermissionKey);
    }

    if (
      (index + 1) % rolePermissionProgressInterval === 0
      || index + 1 === rolePermissionSeeds.length
    ) {
      console.log(
        `[seed][auth] Processed ${index + 1}/${rolePermissionSeeds.length} role-permission links in ${formatDuration(Date.now() - rolePermissionsStartedAt)}`,
      );
    }
  }

  await em.flush();

  return { roleByKey, permissionByKey };
}
