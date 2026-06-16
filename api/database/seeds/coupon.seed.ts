import type { EntityManager } from '@mikro-orm/postgresql';
import { CouponEntity } from '../../src/modules/domains/coupon/infra/persistence/entities/coupon.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { ShopEntity } from '../../src/modules/domains/shop/infra/persistence/entities/shop.entity';
import { couponSeeds } from './coupon.seed-loader';

export async function seedCoupons(
  em: EntityManager,
  shopsBySlug: Map<string, ShopEntity>
): Promise<void> {
  for (const couponSeed of couponSeeds) {
    const shop = shopsBySlug.get(couponSeed.shopSlug);

    if (!shop) {
      throw new Error(`Missing seeded shop for coupon: ${couponSeed.shopSlug}`);
    }

    const appliesProductIds: string[] = [];

    if (couponSeed.appliesProductTitles?.length) {
      for (const title of couponSeed.appliesProductTitles) {
        const product = await em.findOne(ProductEntity, {
          shop,
          title,
        });

        if (!product) {
          throw new Error(
            `Missing seeded product "${title}" for coupon ${couponSeed.code}`
          );
        }

        appliesProductIds.push(product.id);
      }
    }

    const coupon =
      (await em.findOne(CouponEntity, {
        shop,
        code: couponSeed.code,
      })) ??
      em.create(CouponEntity, {
        shop,
        code: couponSeed.code,
        type: couponSeed.type,
        appliesTo: couponSeed.appliesTo,
        appliesProductIds,
        amountOff: couponSeed.amountOff ?? 0,
        percentOff: couponSeed.percentOff ?? 0,
        startDate: new Date(couponSeed.startDate),
        endDate: new Date(couponSeed.endDate),
        maxUses: couponSeed.maxUses,
        maxUsesPerUser: couponSeed.maxUsesPerUser,
        usesCount: 0,
        minOrderType: couponSeed.minOrderType,
        minOrderValue: couponSeed.minOrderValue ?? 0,
        minProducts: couponSeed.minProducts ?? 0,
        isActive: couponSeed.isActive,
        isAutoSale: couponSeed.isAutoSale,
      });

    coupon.shop = shop;
    coupon.code = couponSeed.code;
    coupon.type = couponSeed.type;
    coupon.appliesTo = couponSeed.appliesTo;
    coupon.appliesProductIds = appliesProductIds;
    coupon.amountOff = couponSeed.amountOff ?? 0;
    coupon.percentOff = couponSeed.percentOff ?? 0;
    coupon.startDate = new Date(couponSeed.startDate);
    coupon.endDate = new Date(couponSeed.endDate);
    coupon.maxUses = couponSeed.maxUses;
    coupon.maxUsesPerUser = couponSeed.maxUsesPerUser;
    coupon.minOrderType = couponSeed.minOrderType;
    coupon.minOrderValue = couponSeed.minOrderValue ?? 0;
    coupon.minProducts = couponSeed.minProducts ?? 0;
    coupon.isActive = couponSeed.isActive;
    coupon.isAutoSale = couponSeed.isAutoSale;
    coupon.usesCount = 0;

    em.persist(coupon);
  }

  await em.flush();
}
