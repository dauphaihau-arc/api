import { CouponAppliesTo } from '../../../domain/enums/coupon-applies-to.enum';
import { CouponType } from '../../../domain/enums/coupon-type.enum';
import { CouponEntity } from '../entities/coupon.entity';
import { MikroOrmCouponAutoSaleProjectionReader } from './mikro-orm-coupon-auto-sale-projection.reader';

type CouponSeed = {
  id: string;
  appliesTo: CouponAppliesTo;
  appliesProductIds: string[];
  percentOff: number;
};

describe('MikroOrmCouponAutoSaleProjectionReader', () => {
  it('returns the best active auto-sale percentage coupon for a product', async () => {
    const find = jest.fn<Promise<CouponSeed[]>, [Record<string, unknown>]>().mockResolvedValue([
      {
        id: 'coupon-low',
        appliesTo: CouponAppliesTo.ALL,
        appliesProductIds: [],
        percentOff: 10,
      },
      {
        id: 'coupon-product',
        appliesTo: CouponAppliesTo.SPECIFIC,
        appliesProductIds: ['product-1'],
        percentOff: 25,
      },
      {
        id: 'coupon-other-product',
        appliesTo: CouponAppliesTo.SPECIFIC,
        appliesProductIds: ['product-2'],
        percentOff: 40,
      },
    ]);
    const getRepository = jest.fn().mockReturnValue({ find });
    const entityManager = {
      fork: jest.fn().mockReturnValue({ getRepository }),
    };
    const now = new Date('2026-01-01T00:00:00.000Z');

    const result = await new MikroOrmCouponAutoSaleProjectionReader(
      entityManager as never,
    ).findBestAutoSaleForProduct({
      shopId: 'shop-1',
      productId: 'product-1',
      at: now,
    });

    expect(getRepository).toHaveBeenCalledWith(CouponEntity);
    expect(find).toHaveBeenCalledWith({
      shop: 'shop-1',
      isActive: true,
      isAutoSale: true,
      type: CouponType.PERCENTAGE,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });
    expect(result).toEqual({
      couponId: 'coupon-product',
      percentOff: 25,
    });
  });
});
