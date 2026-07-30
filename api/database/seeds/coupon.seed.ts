import type { EntityManager } from '@mikro-orm/postgresql';
import { CouponEntity } from '~/domains/coupon/infra/persistence/entities/coupon.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { couponSeeds } from './coupon.seed-loader';

function resolveProgressInterval(total: number, maxSteps = 5): number {
  return Math.max(1, Math.ceil(total / maxSteps));
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

export async function seedCoupons(
  em: EntityManager,
  shopsBySlug: Map<string, ShopEntity>,
): Promise<void> {
  const progressInterval = resolveProgressInterval(couponSeeds.length);
  const startedAt = Date.now();
  const targetShops = Array.from(
    new Map(
      couponSeeds.flatMap((couponSeed) => {
        const shop = shopsBySlug.get(couponSeed.shopSlug);

        return shop ? [[shop.slug, shop] as const] : [];
      }),
    ).values(),
  );
  const existingProducts = targetShops.length > 0
    ? await em.find(ProductEntity, { shop: { $in: targetShops } }, { populate: ['shop'] })
    : [];
  const existingProductsByShopSlugAndTitle = new Map(
    existingProducts.map((product) => [`${product.shop.slug}::${product.title}`, product]),
  );
  const existingCoupons = targetShops.length > 0
    ? await em.find(
      CouponEntity,
      {
        shop: { $in: targetShops },
        code: { $in: couponSeeds.map((couponSeed) => couponSeed.code) },
      },
      { populate: ['shop'] },
    )
    : [];
  const existingCouponsByShopSlugAndCode = new Map(
    existingCoupons.map((coupon) => [`${coupon.shop.slug}::${coupon.code}`, coupon]),
  );

  console.log(`[seed][coupons] Upserting ${couponSeeds.length} coupons`);

  for (const [index, couponSeed] of couponSeeds.entries()) {
    const shop = shopsBySlug.get(couponSeed.shopSlug);

    if (!shop) {
      throw new Error(`Missing seeded shop for coupon: ${couponSeed.shopSlug}`);
    }

    const appliesProductIds: string[] = [];

    if (couponSeed.appliesProductTitles?.length) {
      for (const title of couponSeed.appliesProductTitles) {
        const product = existingProductsByShopSlugAndTitle.get(`${shop.slug}::${title}`);

        if (!product) {
          throw new Error(
            `Missing seeded product "${title}" for coupon ${couponSeed.code}`,
          );
        }

        appliesProductIds.push(product.id);
      }
    }

    const coupon =
      existingCouponsByShopSlugAndCode.get(`${shop.slug}::${couponSeed.code}`) ??
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
    existingCouponsByShopSlugAndCode.set(`${shop.slug}::${couponSeed.code}`, coupon);

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

    if ((index + 1) % progressInterval === 0 || index + 1 === couponSeeds.length) {
      console.log(
        `[seed][coupons] Processed ${index + 1}/${couponSeeds.length} coupons in ${formatDuration(Date.now() - startedAt)}`,
      );
    }
  }

  await em.flush();
}
