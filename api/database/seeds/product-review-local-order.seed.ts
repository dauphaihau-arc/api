import type { EntityManager } from '@mikro-orm/postgresql';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { OrderShippingStatus } from '~/domains/order/domain/enums/order-shipping-status.enum';
import { OrderStatus } from '~/domains/order/domain/enums/order-status.enum';
import { PaymentType } from '~/domains/order/domain/enums/payment-type.enum';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { OrderItemEntity } from '~/domains/order/infra/persistence/entities/order-item.entity';
import { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { getInventoryPricingSnapshot } from '~/domains/product/infra/persistence/mikro-orm/reads/variant-price-read';
import {
  PRODUCT_REVIEWS_LOCAL_TSV_PATH,
  PRODUCT_REVIEWS_TSV_PATH,
} from './product-seed-paths';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

type ProductReviewOrderRow = {
  shop_slug: string;
  product_title: string;
  user_email: string;
  created_at: string;
};

type LocalReviewOrderSeed = {
  shopSlug: string;
  productTitle: string;
  userEmail: string;
  reviewCreatedAt?: Date;
  isLocal: boolean;
};

const LOCAL_REVIEW_CHECKOUT_SESSION_PREFIX = 'seed-local-review-';

function resolveProgressInterval(total: number, maxSteps = 5): number {
  return Math.max(1, Math.ceil(total / maxSteps));
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

function parseOptionalDate(value: string, seedKey: string): Date | undefined {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid created_at "${value}" for local product review seed ${seedKey}`);
  }

  return parsed;
}

function mapReviewOrderSeedRows(
  rows: ProductReviewOrderRow[],
  sourceLabel: string,
  isLocal: boolean,
): LocalReviewOrderSeed[] {
  return rows.map((row, index) => {
    const shopSlug = row.shop_slug.trim();
    const productTitle = row.product_title.trim();
    const userEmail = row.user_email.trim().toLowerCase();
    const seedKey = `${userEmail || `row-${index + 2}`}::${shopSlug || 'unknown'}::${productTitle || 'unknown'}`;

    if (!shopSlug) {
      throw new Error(`Missing shop_slug for ${sourceLabel} product review seed row ${index + 2}`);
    }

    if (!productTitle) {
      throw new Error(`Missing product_title for ${sourceLabel} product review seed ${seedKey}`);
    }

    if (!userEmail) {
      throw new Error(`Missing user_email for ${sourceLabel} product review seed ${seedKey}`);
    }

    return {
      shopSlug,
      productTitle,
      userEmail,
      reviewCreatedAt: parseOptionalDate(row.created_at, seedKey),
      isLocal,
    };
  });
}

function loadReviewOrderSeeds(): LocalReviewOrderSeed[] {
  return [
    ...mapReviewOrderSeedRows(
      readTsvRows<ProductReviewOrderRow>(PRODUCT_REVIEWS_TSV_PATH),
      'tracked',
      false,
    ),
    ...mapReviewOrderSeedRows(
      readOptionalTsvRows<ProductReviewOrderRow>(PRODUCT_REVIEWS_LOCAL_TSV_PATH),
      'local',
      true,
    ),
  ];
}

function buildShippingAddress(userEmail: string): Record<string, unknown> {
  const hash = Array.from(userEmail).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const suffix = String((hash % 9000) + 1000);

  return {
    fullName: userEmail.split('@')[0]?.replace(/\./g, ' ') ?? 'Seed Reviewer',
    phone: `+1-415-555-${suffix}`,
    line1: `${(hash % 900) + 100} Review Lane`,
    line2: `Unit ${(hash % 40) + 1}`,
    city: 'San Francisco',
    state: 'CA',
    postalCode: `941${String((hash % 90) + 10)}`,
    country: 'US',
  };
}

function fromMinor(amountMinor: number, currency: string): number {
  return amountMinor / (10 ** (['JPY', 'KRW', 'VND'].includes(currency) ? 0 : 2));
}

export async function seedLocalProductReviewOrders(em: EntityManager): Promise<void> {
  const localSeeds = loadReviewOrderSeeds();

  if (localSeeds.length === 0) {
    return;
  }

  const dedupedSeeds = Array.from(
    new Map(
      localSeeds.map((seed) => [`${seed.userEmail}::${seed.shopSlug}::${seed.productTitle}`, seed]),
    ).values(),
  );
  const progressInterval = resolveProgressInterval(dedupedSeeds.length);
  const startedAt = Date.now();
  let skippedLocalSeeds = 0;

  console.log(
    `[seed][local-review-orders] Upserting ${dedupedSeeds.length} exact review orders`,
  );

  const existingLocalReviewOrders = await em.find(OrderEntity, {}, { populate: ['user'] });
  const localReviewOrdersToDelete = existingLocalReviewOrders.filter((order) => {
    const checkoutSessionId = typeof order.paymentDetails?.checkoutSessionId === 'string'
      ? order.paymentDetails.checkoutSessionId
      : '';

    return checkoutSessionId.startsWith(LOCAL_REVIEW_CHECKOUT_SESSION_PREFIX);
  });

  if (localReviewOrdersToDelete.length > 0) {
    await em.nativeDelete(OrderItemEntity, { order: { $in: localReviewOrdersToDelete.map((order) => order.id) } });
    await em.nativeDelete(OrderEntity, { id: { $in: localReviewOrdersToDelete.map((order) => order.id) } });
  }

  const users = await em.find(UserEntity, {
    email: { $in: dedupedSeeds.map((seed) => seed.userEmail) },
  });
  const usersByEmail = new Map(users.map((user) => [user.email, user]));

  for (const [index, seed] of dedupedSeeds.entries()) {
    const user = usersByEmail.get(seed.userEmail);

    if (!user) {
      if (seed.isLocal) {
        skippedLocalSeeds += 1;
        console.warn(
          `[seed][local-review-orders] Skipping local review order ${seed.userEmail}::${seed.shopSlug}::${seed.productTitle}: missing seeded user`,
        );
        continue;
      }
      throw new Error(
        `Missing seeded user for local product review order ${seed.userEmail}::${seed.shopSlug}::${seed.productTitle}`,
      );
    }

    const inventory = await em.findOne(
      ProductInventoryEntity,
      {
        product: {
          title: seed.productTitle,
          shop: { slug: seed.shopSlug },
        },
      },
      {
        populate: ['product', 'product.images', 'product.shop', 'productVariant', 'prices'],
        orderBy: { stock: 'desc', sku: 'asc' },
      },
    );

    if (!inventory) {
      if (seed.isLocal) {
        skippedLocalSeeds += 1;
        console.warn(
          `[seed][local-review-orders] Skipping local review order ${seed.userEmail}::${seed.shopSlug}::${seed.productTitle}: missing inventory`,
        );
        continue;
      }
      throw new Error(`Missing inventory for local product review order ${seed.userEmail}::${seed.shopSlug}::${seed.productTitle}`);
    }

    const pricing = getInventoryPricingSnapshot(inventory);

    if (!pricing) {
      if (seed.isLocal) {
        skippedLocalSeeds += 1;
        console.warn(
          `[seed][local-review-orders] Skipping local review order ${seed.userEmail}::${seed.shopSlug}::${seed.productTitle}: missing price`,
        );
        continue;
      }
      throw new Error(`Missing price for local product review order ${seed.userEmail}::${seed.shopSlug}::${seed.productTitle}`);
    }

    const image = inventory.product.images.getItems().sort((left, right) => left.rank - right.rank)[0];

    const reviewCreatedAt = seed.reviewCreatedAt ?? new Date(Date.UTC(2026, 4, 20 + (index % 8), 9 + (index % 9), 0, 0));
    const deliveredAt = new Date(reviewCreatedAt.getTime() - (24 * 60 * 60 * 1000));
    const shippedAt = new Date(reviewCreatedAt.getTime() - (2 * 24 * 60 * 60 * 1000));
    const createdAt = new Date(reviewCreatedAt.getTime() - (4 * 24 * 60 * 60 * 1000));
    const unitPrice = fromMinor(pricing.amountMinor, pricing.currency);

    const order = em.create(OrderEntity, {
      user,
      customerEmail: user.email,
      shop: inventory.shop,
      paymentType: PaymentType.CARD,
      status: OrderStatus.COMPLETED,
      shippingStatus: OrderShippingStatus.DELIVERED,
      currency: pricing.currency,
      subtotal: unitPrice,
      subtotalMinor: pricing.amountMinor,
      totalShippingFee: 0,
      shippingMinor: 0,
      totalDiscount: 0,
      discountMinor: 0,
      total: unitPrice,
      totalMinor: pricing.amountMinor,
      note: `Exact local review seed order for ${seed.productTitle}`,
      promoCodes: [],
      shippingAddress: buildShippingAddress(user.email),
      shippingOriginCountries: [pricing.currency === 'GBP' ? 'GB' : 'US'],
      shippingToCountry: pricing.currency === 'GBP' ? 'GB' : 'US',
      shippingEstimatedDelivery: deliveredAt,
      shippedAt,
      deliveredAt,
      paymentDetails: {
        provider: 'seed',
        checkoutSessionId: `${LOCAL_REVIEW_CHECKOUT_SESSION_PREFIX}${index + 1}`,
      },
      createdAt,
      updatedAt: createdAt,
    });
    em.persist(order);

    em.persist(em.create(OrderItemEntity, {
      order,
      product: inventory.product,
      inventory,
      title: inventory.product.title,
      imageUrl: image?.storageKey,
      variantGroupName: inventory.product.variantGroupName,
      variantSubGroupName: inventory.product.variantSubGroupName,
      variantName: inventory.productVariant?.name,
      price: pricing.originalAmountMinor != null
        ? fromMinor(pricing.originalAmountMinor, pricing.currency)
        : unitPrice,
      unitPriceMinor: pricing.amountMinor,
      salePrice: pricing.originalAmountMinor != null
        ? unitPrice
        : undefined,
      originalAmountMinor: pricing.originalAmountMinor,
      quantity: 1,
      lineTotalMinor: pricing.amountMinor,
      currency: pricing.currency,
      sourceType: 'base_native',
      createdAt,
      updatedAt: createdAt,
    }));

    await em.flush();

    if ((index + 1) % progressInterval === 0 || index + 1 === dedupedSeeds.length) {
      console.log(
        `[seed][local-review-orders] Processed ${index + 1}/${dedupedSeeds.length} orders in ${formatDuration(Date.now() - startedAt)}`,
      );
    }
  }

  if (skippedLocalSeeds > 0) {
    console.log(
      `[seed][local-review-orders] Skipped ${skippedLocalSeeds} local review order seed(s) with unresolved user/inventory/pricing references`,
    );
  }
}
