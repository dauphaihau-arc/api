import type { EntityManager } from '@mikro-orm/postgresql';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { PromotionCodeEntity } from '~/domains/promotion/infra/persistence/entities/promotion-code.entity';
import { PromotionProductEntity } from '~/domains/promotion/infra/persistence/entities/promotion-product.entity';
import { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';
import type { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { promotionSeeds } from './promotion.seed-loader';

function resolveProgressInterval(total: number, maxSteps = 5): number {
  return Math.max(1, Math.ceil(total / maxSteps));
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

function promotionKey(shopSlug: string, name: string): string {
  return `${shopSlug}::${name}`;
}

export async function seedPromotions(
  em: EntityManager,
  shopsBySlug: Map<string, ShopEntity>,
): Promise<void> {
  const progressInterval = resolveProgressInterval(promotionSeeds.length);
  const startedAt = Date.now();
  const targetShops = Array.from(
    new Map(
      promotionSeeds.flatMap((seed) => {
        const shop = shopsBySlug.get(seed.shopSlug);

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
  const existingPromotions = targetShops.length > 0
    ? await em.find(
      PromotionEntity,
      {
        shop: { $in: targetShops },
        name: { $in: promotionSeeds.map((seed) => seed.name) },
      },
      { populate: ['shop'] },
    )
    : [];
  const existingByKey = new Map<string, PromotionEntity>(
    existingPromotions.map((promotion) => [
      promotionKey(promotion.shop.slug, promotion.name),
      promotion,
    ]),
  );

  console.log(`[seed][promotions] Upserting ${promotionSeeds.length} promotions`);

  for (const [index, seed] of promotionSeeds.entries()) {
    const shop = shopsBySlug.get(seed.shopSlug);

    if (!shop) {
      throw new Error(`Missing seeded shop for promotion: ${seed.shopSlug}`);
    }

    // The Promotion Currency is the owning Shop's currency. A TSV that
    // disagrees with the shop would persist an amount attributed to the wrong
    // currency, so the seed fails instead of guessing.
    if (seed.currency !== shop.currency) {
      throw new Error(
        `Promotion ${seed.name} currency ${seed.currency} does not match shop ${shop.slug} currency ${shop.currency}`,
      );
    }

    const productIds: string[] = [];

    if (seed.appliesProductTitles?.length) {
      for (const title of seed.appliesProductTitles) {
        const product = existingProductsByShopSlugAndTitle.get(`${shop.slug}::${title}`);

        if (!product) {
          throw new Error(
            `Missing seeded product "${title}" for promotion ${seed.name}`,
          );
        }

        productIds.push(product.id);
      }
    }

    const key = promotionKey(shop.slug, seed.name);
    const promotion = existingByKey.get(key) ?? em.create(PromotionEntity, {
      shop,
      name: seed.name,
      applicationKind: seed.applicationKind,
      benefitType: seed.benefitType,
      currency: seed.currency,
      productScope: seed.productScope,
      startAt: new Date(seed.startAt),
      endAt: new Date(seed.endAt),
      timezone: seed.timezone,
    });
    existingByKey.set(key, promotion);

    promotion.shop = shop;
    promotion.name = seed.name;
    promotion.applicationKind = seed.applicationKind;
    promotion.benefitType = seed.benefitType;
    promotion.currency = seed.currency;
    promotion.productScope = seed.productScope;
    promotion.percentOff = seed.percentOff ?? null;
    promotion.amountOff = seed.amountOff ?? null;
    promotion.visibility = seed.visibility ?? null;
    promotion.minOrderType = seed.minOrderType;
    promotion.minOrderValue = seed.minOrderValue ?? 0;
    promotion.minPurchaseQuantity = seed.minPurchaseQuantity ?? 0;
    promotion.maxRedemptions = seed.maxRedemptions ?? null;
    promotion.maxRedemptionsPerBuyer = seed.maxRedemptionsPerBuyer ?? null;
    promotion.startAt = new Date(seed.startAt);
    promotion.endAt = new Date(seed.endAt);
    promotion.timezone = seed.timezone;

    em.persist(promotion);

    if (seed.code) {
      const existingCode = await em.findOne(PromotionCodeEntity, {
        shopId: shop.id,
        code: seed.code,
      });

      if (existingCode) {
        existingCode.promotion = promotion;
        em.persist(existingCode);
      }
      else {
        em.persist(em.create(PromotionCodeEntity, {
          promotion,
          shopId: shop.id,
          code: seed.code,
        }));
      }
    }

    await em.nativeDelete(PromotionProductEntity, { promotion: promotion.id });
    productIds.forEach((productId) => {
      em.persist(em.create(PromotionProductEntity, { promotion, productId }));
    });

    if ((index + 1) % progressInterval === 0 || index + 1 === promotionSeeds.length) {
      console.log(
        `[seed][promotions] Processed ${index + 1}/${promotionSeeds.length} promotions in ${formatDuration(Date.now() - startedAt)}`,
      );
    }
  }

  await em.flush();
}
