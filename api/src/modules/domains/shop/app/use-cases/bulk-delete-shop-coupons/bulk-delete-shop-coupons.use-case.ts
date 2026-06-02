import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { CouponEntity } from '~/modules/domains/coupon/infra/persistence/entities/coupon.entity';

export interface BulkDeleteShopCouponsResult {
  succeededIds: string[];
  failed: Array<{
    id: string;
    code: string;
    reason: string;
  }>;
}

@Injectable()
export class BulkDeleteShopCouponsUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    couponIds: string[]
  ): Promise<BulkDeleteShopCouponsResult> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(CouponEntity);
    const coupons = await repository.find(
      { id: { $in: couponIds } },
      { populate: ['shop', 'shop.ownerUser'] }
    );
    const couponsById = new Map(coupons.map(coupon => [coupon.id, coupon]));

    const succeededIds: string[] = [];
    const failed: BulkDeleteShopCouponsResult['failed'] = [];

    for (const couponId of couponIds) {
      const coupon = couponsById.get(couponId);

      if (!coupon || coupon.shop.id !== shopId) {
        failed.push({
          id: couponId,
          code: 'NotFound',
          reason: 'Coupon not found',
        });
        continue;
      }

      if (
        coupon.shop.ownerUser.id !== actor.userId
        && !actor.roles.includes('admin')
      ) {
        failed.push({
          id: couponId,
          code: 'Forbidden',
          reason: 'You do not own this shop',
        });
        continue;
      }

      entityManager.remove(coupon);
      succeededIds.push(couponId);
    }

    if (succeededIds.length > 0) {
      await entityManager.flush();
    }

    return {
      succeededIds,
      failed,
    };
  }
}
