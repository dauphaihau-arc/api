import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { CouponAppliesTo } from '~/domains/coupon/domain/enums/coupon-applies-to.enum';
import { CouponType } from '~/domains/coupon/domain/enums/coupon-type.enum';
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

    const couponRepository = {
      find: jest.fn().mockImplementation(async ({ id }) =>
        id.$in.map((couponId: string) => coupons.get(couponId)).filter(Boolean),
      ),
    };
    const fork = {
      getRepository: jest.fn().mockReturnValue(couponRepository),
      remove: jest.fn().mockImplementation((coupon: { id: string }) => {
        removed.push(coupon.id);
      }),
      flush: jest.fn().mockResolvedValue(undefined),
    };
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    return {
      removed,
      fork,
      couponRepository,
      entityManager: {
        fork: jest.fn().mockReturnValue(fork),
      } as unknown as jest.Mocked<EntityManager>,
      jobDispatcher,
    };
  }

  it('deletes all matching owned coupons', async () => {
    const {
      entityManager, removed, fork, jobDispatcher,
    } = buildEntityManager();
    const useCase = new BulkDeleteShopCouponsUseCase(entityManager, jobDispatcher as never);

    const result = await useCase.execute(actor, 'shop-1', ['coupon-1', 'coupon-2']);

    expect(result).toEqual({
      succeededIds: ['coupon-1', 'coupon-2'],
      failed: [],
    });
    expect(removed).toEqual(['coupon-1', 'coupon-2']);
    expect(fork.flush).toHaveBeenCalledTimes(1);
  });

  it('returns partial failures for missing or wrong-shop coupons', async () => {
    const {
      entityManager, removed, fork, jobDispatcher,
    } = buildEntityManager();
    const useCase = new BulkDeleteShopCouponsUseCase(entityManager, jobDispatcher as never);

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

  it('dispatches catalog projection when deleting auto-sale coupons', async () => {
    const { entityManager, jobDispatcher, couponRepository } = buildEntityManager();
    couponRepository.find.mockResolvedValueOnce([
      {
        id: 'coupon-1',
        shop: {
          id: 'shop-1',
          ownerUser: {
            id: 'shop-owner-1',
          },
        },
        appliesTo: CouponAppliesTo.ALL,
        appliesProductIds: [],
        type: CouponType.PERCENTAGE,
        percentOff: 18,
        isActive: true,
        isAutoSale: true,
      },
    ]);
    const useCase = new BulkDeleteShopCouponsUseCase(entityManager, jobDispatcher as never);

    await useCase.execute(actor, 'shop-1', ['coupon-1']);

    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'catalog.project-shop-products',
      { shopId: 'shop-1' },
      expect.objectContaining({
        deduplicationKey: expect.stringContaining('coupon-bulk-delete-coupon-1'),
      }),
    );
  });
});
