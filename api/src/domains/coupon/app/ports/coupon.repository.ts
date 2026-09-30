import type { CouponEntity } from '../../infra/persistence/entities/coupon.entity';

/**
 * Persistence port for the ordinary Coupon reads the pricing service needs:
 * loading a shop's Coupons and counting how many times one buyer has used them.
 */
export abstract class CouponRepository {
  abstract findByShopIds(shopIds: string[]): Promise<CouponEntity[]>;

  abstract countUsagesByUser(
    couponIds: string[],
    userId: string,
  ): Promise<Map<string, number>>;
}
