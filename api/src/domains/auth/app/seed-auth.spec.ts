import { UserCredentialEntity } from '~/domains/auth/infra/persistence/entities/user-credential.entity';
import { PermissionEntity } from '~/domains/auth/infra/persistence/entities/permission.entity';
import { RolePermissionEntity } from '~/domains/auth/infra/persistence/entities/role-permission.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { UserRoleEntity } from '~/domains/auth/infra/persistence/entities/user-role.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { seedAuth } from '../../../../database/seeds/auth.seed';

jest.mock('~/domains/auth/infra/security/bcrypt-password-hasher', () => ({
  BcryptPasswordHasher: jest.fn().mockImplementation(() => ({
    hash: jest.fn(async () => 'hashed-password'),
  })),
}));

type SeedEntity = {
  email?: string;
  id?: string;
  key?: string;
  passwordHash?: string;
  permission?: SeedEntity;
  role?: SeedEntity;
  user?: SeedEntity;
  userId?: string;
};

describe('seedAuth', () => {
  it('flushes users before inserting scalar user credential rows', async () => {
    const persistedUsers = new Set<string>();
    const pending: SeedEntity[] = [];
    let userSequence = 0;
    const entityManager = {
      find: jest.fn(async () => []),
      create: jest.fn((entity: { name: string }, data: SeedEntity) => ({
        ...data,
        ...(entity === UserEntity ? { id: `user-${++userSequence}` } : {}),
      })),
      persist: jest.fn((entity: SeedEntity) => {
        pending.push(entity);
      }),
      flush: jest.fn(async () => {
        const credentialBeforeUser = pending.find(
          (entity) => entity.passwordHash !== undefined,
        );

        if (credentialBeforeUser?.userId && !persistedUsers.has(credentialBeforeUser.userId)) {
          throw new Error('user_credentials_user_id_foreign');
        }

        for (const entity of pending.splice(0)) {
          if (entity.email && entity.id) {
            persistedUsers.add(entity.id);
          }
        }
      }),
    };

    await expect(seedAuth(entityManager as never)).resolves.toBeDefined();

    expect(entityManager.flush).toHaveBeenCalled();
    expect(entityManager.create).toHaveBeenCalledWith(UserCredentialEntity, expect.any(Object));
    expect(entityManager.create).toHaveBeenCalledWith(UserRoleEntity, expect.any(Object));
    expect(entityManager.create).toHaveBeenCalledWith(RoleEntity, expect.any(Object));
    expect(entityManager.create).toHaveBeenCalledWith(PermissionEntity, expect.any(Object));
    expect(entityManager.create).toHaveBeenCalledWith(RolePermissionEntity, expect.any(Object));
  });
});
