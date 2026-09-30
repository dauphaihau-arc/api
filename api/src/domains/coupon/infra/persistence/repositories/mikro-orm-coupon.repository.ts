import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { CouponRepository } from '../../../app/ports/coupon.repository';
import { CouponEntity } from '../entities/coupon.entity';
import { CouponUsageEntity } from '../entities/coupon-usage.entity';

@Injectable()
export class MikroOrmCouponRepository extends CouponRepository {
  constructor(private readonly entityManager: EntityManager) {
    super();
  }

  async findByShopIds(shopIds: string[]): Promise<CouponEntity[]> {
    if (shopIds.length === 0) {
      return [];
    }

    return this.entityManager.fork().getRepository(CouponEntity).find({
      shop: { $in: shopIds },
    });
  }

  async countUsagesByUser(
    couponIds: string[],
    userId: string,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    if (couponIds.length === 0) {
      return counts;
    }

    const usages = await this.entityManager.fork().getRepository(CouponUsageEntity).find({
      coupon: { $in: couponIds },
      user: userId,
    });

    for (const usage of usages) {
      counts.set(usage.coupon.id, (counts.get(usage.coupon.id) ?? 0) + 1);
    }

    return counts;
  }
}
