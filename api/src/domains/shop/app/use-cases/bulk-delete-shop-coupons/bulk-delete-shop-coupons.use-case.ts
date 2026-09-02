import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { CouponAppliesTo } from '~/domains/coupon/domain/enums/coupon-applies-to.enum';
import { CouponType } from '~/domains/coupon/domain/enums/coupon-type.enum';
import { CouponEntity } from '~/domains/coupon/infra/persistence/entities/coupon.entity';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { dispatchShopProjection } from '../shop-coupon-catalog-projection';

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
  constructor(
    private readonly entityManager: EntityManager,
    private readonly jobDispatcher: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    couponIds: string[],
  ): Promise<BulkDeleteShopCouponsResult> {
    const entityManager = this.entityManager.fork();
    const repository = entityManager.getRepository(CouponEntity);

    const coupons = await repository.find(
      { id: { $in: couponIds } },
      { populate: ['shop', 'shop.ownerUser'] },
    );
    const couponsById = new Map(coupons.map(coupon => [coupon.id, coupon]));

    const succeededIds: string[] = [];
    const failed: BulkDeleteShopCouponsResult['failed'] = [];
    const deletedProductIds = new Set<string>();
    let shouldProjectAllProducts = false;

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

      if (coupon.isAutoSale && coupon.isActive && coupon.type === CouponType.PERCENTAGE && coupon.percentOff > 0) {
        if (coupon.appliesTo === CouponAppliesTo.ALL) {
          shouldProjectAllProducts = true;
        }
        else {
          coupon.appliesProductIds.forEach((productId) => deletedProductIds.add(productId));
        }
      }
    }

    if (succeededIds.length > 0) {
      await entityManager.flush();

      if (shouldProjectAllProducts || deletedProductIds.size > 0) {
        await dispatchShopProjection(
          this.jobDispatcher,
          shopId,
          shouldProjectAllProducts ? undefined : Array.from(deletedProductIds),
          `coupon-bulk-delete-${succeededIds.join('-')}`,
        );
      }
    }

    return {
      succeededIds,
      failed,
    };
  }
}
