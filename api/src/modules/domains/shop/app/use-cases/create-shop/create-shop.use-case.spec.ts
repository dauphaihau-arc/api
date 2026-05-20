import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthUserRepository } from '~/modules/domains/auth/app/ports/auth-user.repository';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import { RoleKey } from '~/modules/domains/auth/domain/value-objects/role-key';
import type { ShopRepository } from '../../ports/shop.repository';
import { CreateShopUseCase } from './create-shop.use-case';

describe('CreateShopUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'user-1',
    email: 'owner@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  function buildRepository(): jest.Mocked<ShopRepository> {
    return {
      create: jest.fn().mockResolvedValue({
        id: 'shop-1',
        ownerUserId: actor.userId,
        shopName: 'arc-shop',
        slug: 'arc-shop',
        status: 'active',
      }),
      findById: jest.fn(),
      findByOwnerUserId: jest.fn().mockResolvedValue(null),
      findByShopName: jest.fn().mockResolvedValue(null),
      findBySlug: jest.fn().mockResolvedValue(null),
      findOwnedById: jest.fn(),
    };
  }

  function buildEntityManager(): EntityManager {
    return {
      transactional: jest.fn(async (callback: (em: EntityManager) => Promise<unknown>) =>
        callback({} as EntityManager)),
    } as unknown as EntityManager;
  }

  function buildAuthUserRepository(): jest.Mocked<AuthUserRepository> {
    return {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updatePassword: jest.fn(),
      assignRole: jest.fn().mockResolvedValue(undefined),
      ensureRole: jest.fn(),
    };
  }

  it('creates a shop when owner and name are available', async () => {
    const entityManager = buildEntityManager();
    const repository = buildRepository();
    const authUserRepository = buildAuthUserRepository();
    const useCase = new CreateShopUseCase(
      entityManager,
      repository,
      authUserRepository
    );

    const result = await useCase.execute(actor, { shopName: 'arc-shop' });

    expect(result.isOk).toBe(true);
    expect(repository.create).toHaveBeenCalledWith(
      {
        ownerUserId: actor.userId,
        shopName: 'arc-shop',
        slug: 'arc-shop',
      },
      expect.anything()
    );
    expect(authUserRepository.assignRole).toHaveBeenCalledWith(
      actor.userId,
      RoleKey.create('seller'),
      expect.anything()
    );
  });
});
