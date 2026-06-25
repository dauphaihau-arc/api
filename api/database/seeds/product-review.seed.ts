import type { EntityManager } from '@mikro-orm/postgresql';
import { OrderShippingStatus } from '~/modules/domains/order/domain/enums/order-shipping-status.enum';
import { OrderStatus } from '~/modules/domains/order/domain/enums/order-status.enum';
import { ProductImageVariantStatus } from '~/modules/domains/product/domain/enums/product-image-variant-status.enum';
import { OrderItemEntity } from '~/modules/domains/order/infra/persistence/entities/order-item.entity';
import { ProductReviewStatus } from '~/modules/domains/product/domain/enums/product-review-status.enum';
import { MikroOrmProductReviewAggregateRepository } from '~/modules/domains/product/infra/persistence/mikro-orm/repositories/mikro-orm-product-review-aggregate.repository';
import { ProductReviewEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-review.entity';
import { ProductReviewImageEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-review-image.entity';
import {
  isEligibleForProductReview,
  trimOptionalReviewText,
} from '~/modules/domains/product/app/product-review.helpers';
import {
  PRODUCT_REVIEWS_LOCAL_TSV_PATH,
  PRODUCT_REVIEWS_TSV_PATH,
  REVIEW_IMAGE_ROOT_DIRS,
} from './product-seed-paths';
import {
  buildSeedReviewImageStorageKey,
  resolveOptionalSeedReviewImagePaths,
} from './review-seed-image-resolver';
import { readOptionalTsvRows, readTsvRows } from './shared/read-tsv-rows';

const AUTO_REVIEW_BATCH_SIZE = 200;
const AUTO_REVIEW_SELECTION_RATE = 83;
const MAX_AUTO_REVIEW_IMAGES = 2;
const MIN_REVIEWS_PER_PRODUCT = 10;

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

const REVIEW_TITLE_BY_RATING: Record<1 | 2 | 3 | 4 | 5, readonly string[]> = {
  1: [
    'Not what I expected',
    'Would not reorder',
    'Needs improvement',
  ],
  2: [
    'Has some issues',
    'Could be better',
    'Mixed experience',
  ],
  3: [
    'Decent overall',
    'Solid with caveats',
    'Works fine',
  ],
  4: [
    'Very good pickup',
    'Glad I ordered this',
    'Strong value',
  ],
  5: [
    'Exactly right',
    'Would buy again',
    'Exceeded expectations',
  ],
};

const REVIEW_BODY_BY_RATING: Record<1 | 2 | 3 | 4 | 5, readonly string[]> = {
  1: [
    'The finish and overall presentation missed the mark for me. I would skip this version.',
    'The listing looked stronger than the actual item. The details did not come together well.',
    'I gave this a fair try but it did not hold up the way I expected after delivery.',
  ],
  2: [
    'There are good ideas here, but the end result still feels rough around the edges.',
    'Usable in a pinch, though the fit and finish left enough issues that I would not recommend it strongly.',
    'The core product is okay, but it needs cleaner execution to justify a better rating.',
  ],
  3: [
    'This landed about where I expected. It does the job, though it is not especially memorable.',
    'A balanced middle-ground purchase. Nothing alarming, but not the standout item in my order history either.',
    'Reasonably good and easy to use. A few details kept it from feeling exceptional.',
  ],
  4: [
    'The quality felt strong right away and the product matched the description closely.',
    'Easy recommendation for the price point. Delivery was smooth and the item looked great in person.',
    'This was well put together and felt consistent with the rest of the shop presentation.',
  ],
  5: [
    'Everything from packaging to finish felt deliberate. This is one of the better seed purchases in the catalog.',
    'Excellent overall. The item arrived exactly as described and felt premium the moment I opened it.',
    'This exceeded expectations in use and presentation. I would order from this shop again without hesitation.',
  ],
};

type ProductReviewSeedRow = {
  shop_slug: string;
  product_title: string;
  user_email: string;
  rating: string;
  title: string;
  body: string;
  status: string;
  include_images: string;
  image_count: string;
  created_at: string;
};

type ManualProductReviewSeed = {
  shopSlug: string;
  productTitle: string;
  userEmail: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body?: string;
  status: ProductReviewStatus;
  includeImages: boolean;
  imageCount: number;
  createdAt?: Date;
  isLocal: boolean;
};

function parseRating(value: string, seedKey: string): 1 | 2 | 3 | 4 | 5 {
  const normalized = value.trim();
  const parsed = Number(normalized);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error(`Invalid rating "${value}" for product review seed ${seedKey}`);
  }

  return parsed as 1 | 2 | 3 | 4 | 5;
}

function parseStatus(value: string, seedKey: string): ProductReviewStatus {
  const normalized = value.trim();

  if (!normalized) {
    return ProductReviewStatus.PUBLISHED;
  }

  if (normalized === ProductReviewStatus.PUBLISHED || normalized === ProductReviewStatus.HIDDEN) {
    return normalized;
  }

  throw new Error(`Invalid status "${value}" for product review seed ${seedKey}`);
}

function parseOptionalDate(value: string, seedKey: string): Date | undefined {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid created_at "${value}" for product review seed ${seedKey}`);
  }

  return parsed;
}

function parseOptionalPositiveInteger(
  value: string,
  seedKey: string,
  fieldName: string,
): number | undefined {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName} "${value}" for product review seed ${seedKey}`);
  }

  return parsed;
}

function parseBoolean(value: string, seedKey: string, fieldName: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  throw new Error(`Invalid ${fieldName} "${value}" for product review seed ${seedKey}`);
}

function mapManualProductReviewSeeds(
  rows: ProductReviewSeedRow[],
  isLocal: boolean,
): ManualProductReviewSeed[] {
  return rows.map((row, index) => {
    const shopSlug = row.shop_slug.trim();
    const productTitle = row.product_title.trim();
    const userEmail = row.user_email.trim().toLowerCase();
    const seedKey = `${shopSlug || `row-${index + 2}`}::${productTitle || 'unknown'}::${userEmail || 'unknown'}`;

    if (!shopSlug) {
      throw new Error(`Missing shop_slug for product review seed row ${index + 2}`);
    }

    if (!productTitle) {
      throw new Error(`Missing product_title for product review seed ${seedKey}`);
    }

    if (!userEmail) {
      throw new Error(`Missing user_email for product review seed ${seedKey}`);
    }

    return {
      shopSlug,
      productTitle,
      userEmail,
      rating: parseRating(row.rating, seedKey),
      title: trimOptionalReviewText(row.title),
      body: trimOptionalReviewText(row.body),
      status: parseStatus(row.status, seedKey),
      includeImages: parseBoolean(row.include_images, seedKey, 'include_images'),
      imageCount: parseOptionalPositiveInteger(row.image_count, seedKey, 'image_count') ?? 1,
      createdAt: parseOptionalDate(row.created_at, seedKey),
      isLocal,
    };
  });
}

function loadManualProductReviewSeeds(): ManualProductReviewSeed[] {
  return [
    ...mapManualProductReviewSeeds(readTsvRows<ProductReviewSeedRow>(PRODUCT_REVIEWS_TSV_PATH), false),
    ...mapManualProductReviewSeeds(
      readOptionalTsvRows<ProductReviewSeedRow>(PRODUCT_REVIEWS_LOCAL_TSV_PATH),
      true,
    ),
  ];
}

function buildStableHash(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function isSeedOrder(orderItem: OrderItemEntity): boolean {
  const provider = typeof orderItem.order.paymentDetails?.provider === 'string'
    ? orderItem.order.paymentDetails.provider
    : undefined;
  const checkoutSessionId = typeof orderItem.order.paymentDetails?.checkoutSessionId === 'string'
    ? orderItem.order.paymentDetails.checkoutSessionId
    : undefined;

  return orderItem.order.user != null
    && (provider === 'seed' || checkoutSessionId?.startsWith('seed-') === true);
}

function isEligibleSeedReviewOrder(orderItem: OrderItemEntity): boolean {
  if (isEligibleForProductReview(orderItem.order)) {
    return true;
  }

  // Keep review seeding compatible with older demo bulk orders that were seeded as paid+shipped.
  return isSeedOrder(orderItem)
    && orderItem.order.status === OrderStatus.PAID
    && orderItem.order.shippingStatus === OrderShippingStatus.SHIPPED
    && !orderItem.order.refundedAt;
}

function getSeedOrderUser(orderItem: OrderItemEntity) {
  if (!orderItem.order.user) {
    throw new Error(`Seed review order item ${orderItem.id} is missing an associated user`);
  }

  return orderItem.order.user;
}

function buildAutoReviewCreatedAt(orderItem: OrderItemEntity, sequence: number): Date {
  const base = orderItem.order.deliveredAt ??
    orderItem.order.shippingEstimatedDelivery ??
    orderItem.order.shippedAt ??
    orderItem.order.createdAt;
  const offsetHours = (sequence % 72) + 6;

  return new Date(base.getTime() + (offsetHours * 60 * 60 * 1000));
}

function buildAutoReviewUpdatedAt(createdAt: Date, sequence: number): Date {
  const offsetMinutes = (sequence % 9) * 17;
  return new Date(createdAt.getTime() + (offsetMinutes * 60 * 1000));
}

function shouldCreateAutoReview(orderItem: OrderItemEntity): boolean {
  const user = getSeedOrderUser(orderItem);
  const hash = buildStableHash([
    user.email,
    orderItem.product.shop.slug,
    orderItem.product.title,
    orderItem.order.id,
  ].join('::'));

  return (hash % 100) < AUTO_REVIEW_SELECTION_RATE;
}

function buildAutoRating(orderItem: OrderItemEntity): 1 | 2 | 3 | 4 | 5 {
  const user = getSeedOrderUser(orderItem);
  const hash = buildStableHash([
    orderItem.product.shop.slug,
    orderItem.product.title,
    user.email,
  ].join('::'));
  const bucket = hash % 100;

  if (bucket < 2) {
    return 1;
  }

  if (bucket < 7) {
    return 2;
  }

  if (bucket < 20) {
    return 3;
  }

  if (bucket < 52) {
    return 4;
  }

  return 5;
}

function buildAutoStatus(orderItem: OrderItemEntity, rating: 1 | 2 | 3 | 4 | 5): ProductReviewStatus {
  const hash = buildStableHash(`${orderItem.order.id}::${rating}`);

  if (hash % 19 === 0) {
    return ProductReviewStatus.HIDDEN;
  }

  if (rating <= 2 && hash % 3 === 0) {
    return ProductReviewStatus.HIDDEN;
  }

  return ProductReviewStatus.PUBLISHED;
}

function buildAutoTitle(
  orderItem: OrderItemEntity,
  rating: 1 | 2 | 3 | 4 | 5,
): string {
  const options = REVIEW_TITLE_BY_RATING[rating];
  const hash = buildStableHash(`${orderItem.product.title}::${rating}`);
  const prefix = options[hash % options.length];

  if (rating >= 4) {
    return `${prefix} for ${orderItem.product.title}`;
  }

  return prefix;
}

function buildAutoBody(
  orderItem: OrderItemEntity,
  rating: 1 | 2 | 3 | 4 | 5,
): string {
  const options = REVIEW_BODY_BY_RATING[rating];
  const hash = buildStableHash(`${getSeedOrderUser(orderItem).email}::${orderItem.product.shop.slug}::${rating}`);
  const base = options[hash % options.length];

  if (rating >= 4) {
    return `${base} ${orderItem.product.shop.shopName} kept the delivery experience consistent as well.`;
  }

  return `${base} ${orderItem.product.title} still felt like a useful seed case for review moderation.`;
}

function buildOrderItemLookup(orderItems: OrderItemEntity[]): Map<string, OrderItemEntity[]> {
  const buckets = new Map<string, OrderItemEntity[]>();

  orderItems
    .slice()
    .sort((left, right) => right.order.createdAt.getTime() - left.order.createdAt.getTime())
    .forEach((orderItem) => {
      const key = `${getSeedOrderUser(orderItem).email.toLowerCase()}::${orderItem.product.shop.slug}::${orderItem.product.title}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(orderItem);
      buckets.set(key, bucket);
    });

  return buckets;
}

function buildReviewUniquenessKey(orderItem: OrderItemEntity): string {
  return `${getSeedOrderUser(orderItem).email.toLowerCase()}::${orderItem.product.id}`;
}

function resolveManualReviewImageKeys(orderItem: OrderItemEntity, imageCount: number): string[] {
  const imagePaths = resolveOptionalSeedReviewImagePaths(
    REVIEW_IMAGE_ROOT_DIRS,
    orderItem.product.shop.slug,
    orderItem.product.title,
    getSeedOrderUser(orderItem).email,
  );

  if (imagePaths.length === 0) {
    return [];
  }

  return imagePaths
    .slice(0, imageCount)
    .map((imagePath) => buildSeedReviewImageStorageKey(
      orderItem.product.shop.slug,
      orderItem.product.title,
      getSeedOrderUser(orderItem).email,
      imagePath,
    ));
}

function createReviewRecord(
  em: EntityManager,
  orderItem: OrderItemEntity,
  input: {
    rating: 1 | 2 | 3 | 4 | 5;
    title?: string;
    body?: string;
    status: ProductReviewStatus;
    imageKeys: string[];
    createdAt: Date;
    updatedAt: Date;
  },
): void {
  const user = getSeedOrderUser(orderItem);
  const review = em.create(ProductReviewEntity, {
    product: orderItem.product,
    shop: orderItem.order.shop,
    user,
    order: orderItem.order,
    orderItem,
    rating: input.rating,
    title: trimOptionalReviewText(input.title),
    body: trimOptionalReviewText(input.body),
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });

  em.persist(review);

  input.imageKeys.forEach((storageKey, index) => {
    em.persist(em.create(ProductReviewImageEntity, {
      review,
      storageKey,
      rank: index + 1,
      variantStatus: ProductImageVariantStatus.PENDING,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    }));
  });
}

export async function seedProductReviews(em: EntityManager): Promise<void> {
  const productReviewAggregateRepository =
    new MikroOrmProductReviewAggregateRepository(em);
  const startedAt = Date.now();
  const manualSeeds = loadManualProductReviewSeeds();
  const allOrderItems = await em.find(
    OrderItemEntity,
    {},
    {
      populate: ['order', 'order.user', 'product', 'product.shop', 'product.images'],
    },
  );

  const seededOrderItems = allOrderItems.filter(isSeedOrder);
  const eligibleOrderItems = seededOrderItems.filter(isEligibleSeedReviewOrder);

  if (eligibleOrderItems.length === 0) {
    return;
  }

  console.log(
    `[seed][product-reviews] Rebuilding reviews from ${manualSeeds.length} manual seeds and ${eligibleOrderItems.length} eligible order items`,
  );

  const existingReviews = await em.find(ProductReviewEntity, {
    orderItem: { $in: seededOrderItems.map((orderItem) => orderItem.id) },
  });

  if (existingReviews.length > 0) {
    await em.nativeDelete(ProductReviewImageEntity, {
      review: { $in: existingReviews.map((review) => review.id) },
    });
    await em.nativeDelete(ProductReviewEntity, {
      id: { $in: existingReviews.map((review) => review.id) },
    });
  }

  const lookup = buildOrderItemLookup(eligibleOrderItems);
  const usedOrderItemIds = new Set<string>();
  const usedReviewKeys = new Set<string>();
  const touchedProductIds = new Set<string>(eligibleOrderItems.map((orderItem) => orderItem.product.id));
  const reviewCountByProductId = new Map<string, number>();
  let createdCount = 0;
  let skippedLocalManualSeeds = 0;

  for (const manualSeed of manualSeeds) {
    const key = `${manualSeed.userEmail}::${manualSeed.shopSlug}::${manualSeed.productTitle}`;
    const bucket = lookup.get(key) ?? [];
    const orderItem = bucket.find((candidate) => !usedOrderItemIds.has(candidate.id));

    if (!orderItem) {
      if (manualSeed.isLocal) {
        skippedLocalManualSeeds += 1;
        console.warn(
          `[seed][product-reviews] Skipping local manual review seed ${key}: missing eligible seeded order item`,
        );
        continue;
      }
      throw new Error(`Missing eligible seed order item for product review seed ${key}`);
    }

    usedOrderItemIds.add(orderItem.id);
    usedReviewKeys.add(buildReviewUniquenessKey(orderItem));
    reviewCountByProductId.set(
      orderItem.product.id,
      (reviewCountByProductId.get(orderItem.product.id) ?? 0) + 1,
    );
    const createdAt = manualSeed.createdAt ?? buildAutoReviewCreatedAt(orderItem, createdCount + 1);

    createReviewRecord(em, orderItem, {
      rating: manualSeed.rating,
      title: manualSeed.title,
      body: manualSeed.body,
      status: manualSeed.status,
      imageKeys: manualSeed.includeImages
        ? resolveManualReviewImageKeys(orderItem, Math.min(manualSeed.imageCount, MAX_AUTO_REVIEW_IMAGES))
        : [],
      createdAt,
      updatedAt: buildAutoReviewUpdatedAt(createdAt, createdCount + 1),
    });

    createdCount += 1;
  }

  if (manualSeeds.length > 0) {
    console.log(
      `[seed][product-reviews] Applied ${manualSeeds.length - skippedLocalManualSeeds}/${manualSeeds.length} manual review seeds in ${formatDuration(Date.now() - startedAt)}`,
    );
  }

  const orderItemsByProductId = new Map<string, OrderItemEntity[]>();

  for (const orderItem of eligibleOrderItems) {
    if (usedOrderItemIds.has(orderItem.id)) {
      continue;
    }

    const bucket = orderItemsByProductId.get(orderItem.product.id) ?? [];
    bucket.push(orderItem);
    orderItemsByProductId.set(orderItem.product.id, bucket);
  }

  for (const [productId, bucket] of orderItemsByProductId.entries()) {
    const seededCount = reviewCountByProductId.get(productId) ?? 0;
    let createdForProduct = seededCount;

    for (const orderItem of bucket) {
      if (createdForProduct >= MIN_REVIEWS_PER_PRODUCT) {
        break;
      }

      const reviewKey = buildReviewUniquenessKey(orderItem);

      if (usedOrderItemIds.has(orderItem.id) || usedReviewKeys.has(reviewKey)) {
        continue;
      }

      const rating = buildAutoRating(orderItem);
      const createdAt = buildAutoReviewCreatedAt(orderItem, createdCount + 1);

      createReviewRecord(em, orderItem, {
        rating,
        title: buildAutoTitle(orderItem, rating),
        body: buildAutoBody(orderItem, rating),
        status: buildAutoStatus(orderItem, rating),
        imageKeys: [],
        createdAt,
        updatedAt: buildAutoReviewUpdatedAt(createdAt, createdCount + 1),
      });

      usedOrderItemIds.add(orderItem.id);
      usedReviewKeys.add(reviewKey);
      createdForProduct += 1;
      reviewCountByProductId.set(productId, createdForProduct);
      createdCount += 1;

      if (createdCount % AUTO_REVIEW_BATCH_SIZE === 0) {
        await em.flush();
        console.log(
          `[seed][product-reviews] Buffered ${createdCount} reviews in ${formatDuration(Date.now() - startedAt)}`,
        );
      }
    }
  }

  for (const orderItem of eligibleOrderItems) {
    const reviewKey = buildReviewUniquenessKey(orderItem);

    if (usedOrderItemIds.has(orderItem.id) || usedReviewKeys.has(reviewKey) || !shouldCreateAutoReview(orderItem)) {
      continue;
    }

    const rating = buildAutoRating(orderItem);
    const createdAt = buildAutoReviewCreatedAt(orderItem, createdCount + 1);

    createReviewRecord(em, orderItem, {
      rating,
      title: buildAutoTitle(orderItem, rating),
      body: buildAutoBody(orderItem, rating),
      status: buildAutoStatus(orderItem, rating),
      imageKeys: [],
      createdAt,
      updatedAt: buildAutoReviewUpdatedAt(createdAt, createdCount + 1),
    });

    usedOrderItemIds.add(orderItem.id);
    usedReviewKeys.add(reviewKey);
    reviewCountByProductId.set(
      orderItem.product.id,
      (reviewCountByProductId.get(orderItem.product.id) ?? 0) + 1,
    );
    createdCount += 1;

    if (createdCount % AUTO_REVIEW_BATCH_SIZE === 0) {
      await em.flush();
      console.log(
        `[seed][product-reviews] Buffered ${createdCount} reviews in ${formatDuration(Date.now() - startedAt)}`,
      );
    }
  }

  await em.flush();
  console.log(
    `[seed][product-reviews] Persisted ${createdCount} reviews in ${formatDuration(Date.now() - startedAt)}`,
  );

  for (const productId of touchedProductIds) {
    await productReviewAggregateRepository.recalculateForProduct(productId);
  }

  console.log(
    `[seed][product-reviews] Recalculated aggregates for ${touchedProductIds.size} products in ${formatDuration(Date.now() - startedAt)}`,
  );
}
