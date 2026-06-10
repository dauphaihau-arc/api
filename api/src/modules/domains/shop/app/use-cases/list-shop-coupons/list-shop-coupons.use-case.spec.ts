import type { EntityManager } from '@mikro-orm/postgresql';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CouponEntity } from '~/modules/domains/coupon/infra/persistence/entities/coupon.entity';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import { ShopEntity } from '../../../infra/persistence/entities/shop.entity';
import { ListShopCouponsUseCase } from './list-shop-coupons.use-case';

describe('ListShopCouponsUseCase', () => {
  function buildActor(userId: string): AuthenticatedUser {
    return {
      userId,
      email: `${userId}@example.com`,
      status: UserStatus.ACTIVE,
      sessionId: `session-${userId}`,
      roles: [],
      permissions: [],
    };
  }

  function buildUseCase() {
    const shopRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'shop-1',
        ownerUser: { id: 'user-1' },
      }),
    };
    const couponRepository = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      count: jest.fn()
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(5),
    };
    const entityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        if (entity === ShopEntity) {
          return shopRepository;
        }

        if (entity === CouponEntity) {
          return couponRepository;
        }

        throw new Error(`Unexpected repository ${entity.name}`);
      }),
    } as unknown as EntityManager;
    const useCase = new ListShopCouponsUseCase({
      fork: jest.fn(() => entityManager),
    } as unknown as EntityManager);

    return {
      useCase,
      shopRepository,
      couponRepository,
    };
  }

  it('returns coupon counts from the base filters while applying the selected type to results', async () => {
    const { useCase, couponRepository } = buildUseCase();

    const result = await useCase.execute(
      buildActor('user-1'),
      'shop-1',
      {
        code: 'SAVE',
        is_auto_sale: true,
        activeFrom: new Date('2026-06-01T00:00:00.000Z'),
        activeTo: new Date('2026-06-30T23:59:59.999Z'),
        page: 2,
        limit: 10,
      }
    );

    expect(couponRepository.findAndCount).toHaveBeenCalledWith(
      {
        shop: 'shop-1',
        code: { $ilike: '%SAVE%' },
        startDate: { $gte: new Date('2026-06-01T00:00:00.000Z') },
        endDate: { $lte: new Date('2026-06-30T23:59:59.999Z') },
        isAutoSale: true,
      },
      {
        orderBy: { createdAt: 'desc' },
        offset: 10,
        limit: 10,
      }
    );
    expect(couponRepository.count).toHaveBeenNthCalledWith(1, {
      shop: 'shop-1',
      code: { $ilike: '%SAVE%' },
      startDate: { $gte: new Date('2026-06-01T00:00:00.000Z') },
      endDate: { $lte: new Date('2026-06-30T23:59:59.999Z') },
    });
    expect(couponRepository.count).toHaveBeenNthCalledWith(2, {
      shop: 'shop-1',
      code: { $ilike: '%SAVE%' },
      startDate: { $gte: new Date('2026-06-01T00:00:00.000Z') },
      endDate: { $lte: new Date('2026-06-30T23:59:59.999Z') },
      isAutoSale: false,
    });
    expect(couponRepository.count).toHaveBeenNthCalledWith(3, {
      shop: 'shop-1',
      code: { $ilike: '%SAVE%' },
      startDate: { $gte: new Date('2026-06-01T00:00:00.000Z') },
      endDate: { $lte: new Date('2026-06-30T23:59:59.999Z') },
      isAutoSale: true,
    });
    expect(result.typeCounts).toEqual({
      all: 12,
      promo_code: 7,
      sale: 5,
    });
  });

  it('throws when the shop does not exist', async () => {
    const { useCase, shopRepository } = buildUseCase();
    shopRepository.findOne.mockResolvedValueOnce(null);

    await expect(useCase.execute(
      buildActor('user-1'),
      'shop-1',
      { page: 1, limit: 20 }
    )).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when the actor cannot manage the shop', async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute(
      buildActor('user-2'),
      'shop-1',
      { page: 1, limit: 20 }
    )).rejects.toBeInstanceOf(ForbiddenException);
  });
});
