import { EntityManager } from '@mikro-orm/postgresql';
import { buildAuthConfig } from '../../src/config/auth.config';
import { UserStatus } from '../../src/modules/domains/auth/domain/enums/user-status.enum';
import { CurrentUserCredentialEntity } from '../../src/modules/domains/auth/infra/persistence/entities/current-user-credential.entity';
import { CurrentUserEntity } from '../../src/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { PermissionEntity } from '../../src/modules/domains/auth/infra/persistence/entities/permission.entity';
import { RoleEntity } from '../../src/modules/domains/auth/infra/persistence/entities/role.entity';
import { RolePermissionEntity } from '../../src/modules/domains/auth/infra/persistence/entities/role-permission.entity';
import { UserRoleEntity } from '../../src/modules/domains/auth/infra/persistence/entities/user-role.entity';
import { BcryptPasswordHasher } from '../../src/modules/domains/auth/infra/security/bcrypt-password-hasher';

type UserSeed = {
  email: string;
  displayName: string;
  password: string;
  roleKey: string;
  emailVerified: boolean;
};

const roles = [
  {
    key: 'customer',
    name: 'Customer',
    description: 'Buys products',
  },
  {
    key: 'seller',
    name: 'Seller',
    description: 'Lists and sells products',
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Manages platform operations',
  },
] as const;

const permissions = [
  {
    key: 'auth.me.read',
    name: 'Read Current Auth Profile',
    description: 'Read the current authenticated user profile',
  },
  {
    key: 'auth.session.manage',
    name: 'Manage Auth Sessions',
    description: 'Refresh and revoke authentication sessions',
  },
  {
    key: 'shops.create',
    name: 'Create Shops',
    description: 'Create a shop account',
  },
  {
    key: 'shops.manage',
    name: 'Manage Shops',
    description: 'Manage owned shop resources such as products and coupons',
  },
  {
    key: 'users.read',
    name: 'Read Users',
    description: 'View user records',
  },
  {
    key: 'users.manage',
    name: 'Manage Users',
    description: 'Create, update, or disable users',
  },
  {
    key: 'roles.read',
    name: 'Read Roles',
    description: 'View role definitions',
  },
  {
    key: 'roles.manage',
    name: 'Manage Roles',
    description: 'Create or update roles and assignments',
  },
] as const;

const rolePermissionMap: Record<string, string[]> = {
  admin: permissions.map((permission) => permission.key),
  customer: ['auth.me.read', 'auth.session.manage', 'shops.create'],
  seller: ['auth.me.read', 'auth.session.manage', 'shops.manage'],
};

const userSeeds: UserSeed[] = [
  {
    email: 'admin@example.com',
    displayName: 'System Admin',
    password: 'password123',
    roleKey: 'admin',
    emailVerified: true,
  },
  {
    email: 'member@example.com',
    displayName: 'Default Member',
    password: 'password123',
    roleKey: 'customer',
    emailVerified: true,
  },
  {
    email: 'maker.olive@example.com',
    displayName: 'Olive Hart',
    password: 'password123',
    roleKey: 'seller',
    emailVerified: true,
  },
  {
    email: 'maker.mason@example.com',
    displayName: 'Mason Reed',
    password: 'password123',
    roleKey: 'seller',
    emailVerified: true,
  },
  {
    email: 'maker.sage@example.com',
    displayName: 'Sage Lane',
    password: 'password123',
    roleKey: 'seller',
    emailVerified: true,
  },
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

  for (const [roleKey, permissionKeys] of Object.entries(rolePermissionMap)) {
    const role = roleByKey.get(roleKey);

    if (!role) {
      throw new Error(`Missing seed role: ${roleKey}`);
    }

    for (const permissionKey of permissionKeys) {
      const permission = permissionByKey.get(permissionKey);

      if (!permission) {
        throw new Error(`Missing seed permission: ${permissionKey}`);
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
  }

  await em.flush();

  return { roleByKey, permissionByKey };
}
