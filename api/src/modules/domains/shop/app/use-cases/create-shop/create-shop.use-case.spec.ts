import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
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
        status: 'active',
      }),
      findById: jest.fn(),
      findByOwnerUserId: jest.fn().mockResolvedValue(null),
      findByShopName: jest.fn().mockResolvedValue(null),
      findOwnedById: jest.fn(),
    };
  }

  it('creates a shop when owner and name are available', async () => {
    const repository = buildRepository();
    const useCase = new CreateShopUseCase(repository);

    const result = await useCase.execute(actor, { shopName: 'arc-shop' });

    expect(result.isOk).toBe(true);
    expect(repository.create).toHaveBeenCalledWith({
      ownerUserId: actor.userId,
      shopName: 'arc-shop',
    });
  });
});
