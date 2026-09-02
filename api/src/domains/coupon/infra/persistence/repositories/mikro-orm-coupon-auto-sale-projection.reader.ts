import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  CouponAutoSaleProjectionReader,
  type FindBestAutoSaleForProductInput,
  type ProductAutoSaleProjection,
} from '../../../app/ports/coupon-auto-sale-projection.reader';
import { CouponAppliesTo } from '../../../domain/enums/coupon-applies-to.enum';
import { CouponType } from '../../../domain/enums/coupon-type.enum';
import { CouponEntity } from '../entities/coupon.entity';

@Injectable()
export class MikroOrmCouponAutoSaleProjectionReader extends CouponAutoSaleProjectionReader {
  constructor(private readonly entityManager: EntityManager) {
    super();
  }

  async findBestAutoSaleForProduct(
    input: FindBestAutoSaleForProductInput,
  ): Promise<ProductAutoSaleProjection | undefined> {
    const now = input.at ?? new Date();
    const coupons = await this.entityManager.fork().getRepository(CouponEntity).find({
      shop: input.shopId,
      isActive: true,
      isAutoSale: true,
      type: CouponType.PERCENTAGE,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });

    const bestCoupon = coupons
      .filter((coupon) => coupon.appliesTo === CouponAppliesTo.ALL
        || coupon.appliesProductIds.includes(input.productId))
      .filter((coupon) => coupon.percentOff > 0)
      .sort((left, right) => right.percentOff - left.percentOff)[0];

    return bestCoupon
      ? {
        couponId: bestCoupon.id,
        percentOff: bestCoupon.percentOff,
      }
      : undefined;
  }
}
