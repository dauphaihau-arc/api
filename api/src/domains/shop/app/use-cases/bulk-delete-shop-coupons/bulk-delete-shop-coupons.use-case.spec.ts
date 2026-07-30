import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { BulkDeleteShopCouponsUseCase } from './bulk-delete-shop-coupons.use-case';

describe('BulkDeleteShopCouponsUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'shop-owner-1',
    email: 'owner@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  function buildEntityManager() {
    const coupons = new Map([
      ['coupon-1', {
        id: 'coupon-1',
        shop: {
          id: 'shop-1',
          ownerUser: {
            id: 'shop-owner-1',
          },
        },
      }],
      ['coupon-2', {
        id: 'coupon-2',
        shop: {
          id: 'shop-1',
          ownerUser: {
            id: 'shop-owner-1',
          },
        },
      }],
      ['coupon-3', {
        id: 'coupon-3',
        shop: {
          id: 'shop-2',
          ownerUser: {
            id: 'another-owner',
          },
        },
      }],
    ]);

    const removed: string[] = [];

    const fork = {
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn().mockImplementation(async ({ id }) =>
          id.$in.map((couponId: string) => coupons.get(couponId)).filter(Boolean),
        ),
      }),
      remove: jest.fn().mockImplementation((coupon: { id: string }) => {
        removed.push(coupon.id);
      }),
      flush: jest.fn().mockResolvedValue(undefined),
    };

    return {
      removed,
      fork,
      entityManager: {
        fork: jest.fn().mockReturnValue(fork),
      } as unknown as jest.Mocked<EntityManager>,
    };
  }

  it('deletes all matching owned coupons', async () => {
    const { entityManager, removed, fork } = buildEntityManager();
    const useCase = new BulkDeleteShopCouponsUseCase(entityManager);

    const result = await useCase.execute(actor, 'shop-1', ['coupon-1', 'coupon-2']);

    expect(result).toEqual({
      succeededIds: ['coupon-1', 'coupon-2'],
      failed: [],
    });
    expect(removed).toEqual(['coupon-1', 'coupon-2']);
    expect(fork.flush).toHaveBeenCalledTimes(1);
  });

  it('returns partial failures for missing or wrong-shop coupons', async () => {
    const { entityManager, removed, fork } = buildEntityManager();
    const useCase = new BulkDeleteShopCouponsUseCase(entityManager);

    const result = await useCase.execute(actor, 'shop-1', ['coupon-1', 'coupon-3', 'missing']);

    expect(result).toEqual({
      succeededIds: ['coupon-1'],
      failed: [
        {
          id: 'coupon-3',
          code: 'NotFound',
          reason: 'Coupon not found',
        },
        {
          id: 'missing',
          code: 'NotFound',
          reason: 'Coupon not found',
        },
      ],
    });
    expect(removed).toEqual(['coupon-1']);
    expect(fork.flush).toHaveBeenCalledTimes(1);
  });
});
