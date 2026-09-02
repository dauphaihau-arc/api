import type { EntityManager } from '@mikro-orm/postgresql';
import { buildAuthConfig } from '~/platform/config/auth.config';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import { UserCredentialEntity } from '~/domains/auth/infra/persistence/entities/user-credential.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { RoleEntity } from '~/domains/auth/infra/persistence/entities/role.entity';
import { UserRoleEntity } from '~/domains/auth/infra/persistence/entities/user-role.entity';
import { BcryptPasswordHasher } from '~/domains/auth/infra/security/bcrypt-password-hasher';
import { OrderShippingStatus } from '~/domains/order/domain/enums/order-shipping-status.enum';
import { OrderStatus } from '~/domains/order/domain/enums/order-status.enum';
import { PaymentType } from '~/domains/order/domain/enums/payment-type.enum';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { OrderItemEntity } from '~/domains/order/infra/persistence/entities/order-item.entity';
import { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { ProductImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';
import type { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { getInventoryPricingSnapshot } from '~/domains/product/infra/persistence/mikro-orm/reads/variant-price-read';

const SEED_BUYER_EMAIL_PREFIX = 'seed.buyer.';
const SEED_BUYER_PASSWORD = 'Password123!';
const SEED_BUYER_COUNT = 320;
const BEST_SELLER_PRODUCT_COUNT = 20;
const BEST_SELLER_TOP_COUNT = 160;
const BEST_SELLER_COUNT_STEP = 5;
const NOISE_ORDERS_PER_PRODUCT = 10;
const ORDER_BATCH_SIZE = 100;
const LOOKBACK_DAYS = 170;
const RECENT_PAID_WINDOW_DAYS = 21;
const PREFERRED_SHOP_ORDER = [
  'noirvember',
  'signal-foundry',
  'prompt-parlor',
  'benedict-mercy',
  'seoul-vault',
  'rowan-menswear',
  'static-archive',
  'terrain-index',
  'olive-atelier',
  'reed-workshop',
  'sage-studio',
  'hazel-home',
  'juno-console',
] as const;
const SHIPPING_FEES = [0, 4.99, 6.5, 8.75] as const;
const FIRST_NAMES = [
  'Alex',
  'Casey',
  'Jordan',
  'Taylor',
  'Riley',
  'Morgan',
  'Avery',
  'Parker',
  'Jamie',
  'Quinn',
] as const;
const LAST_NAMES = [
  'Stone',
  'Brooks',
  'Hayes',
  'Reed',
  'Bennett',
  'Perry',
  'Bailey',
  'Rivera',
  'Foster',
  'Sutton',
] as const;
const CITIES = [
  {
    city: 'San Francisco',
    state: 'CA',
    postalPrefix: '941',
    country: 'US',
    phonePrefix: '+1-415-555-',
  },
  {
    city: 'Austin',
    state: 'TX',
    postalPrefix: '787',
    country: 'US',
    phonePrefix: '+1-512-555-',
  },
  {
    city: 'Seattle',
    state: 'WA',
    postalPrefix: '981',
    country: 'US',
    phonePrefix: '+1-206-555-',
  },
  {
    city: 'London',
    state: 'LDN',
    postalPrefix: 'EC1A',
    country: 'GB',
    phonePrefix: '+44-20-5555-',
  },
] as const;

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

type SeedBuyer = {
  index: number;
  user: UserEntity;
};

type SeedProductCandidate = {
  product: ProductEntity;
  inventory: ProductInventoryEntity;
  image: ProductImageEntity;
  amountMinor: number;
  originalAmountMinor?: number;
  currency: string;
};

type WeightedProductTarget = {
  candidate: SeedProductCandidate;
  orderCount: number;
};

export async function seedBulkOrderDemo(em: EntityManager): Promise<void> {
  const startedAt = Date.now();
  const buyers = await recreateSeedBuyers(em);
  const { bestSellerTargets, noiseTargets } = await loadWeightedTargets(em);
  const totalOrders = bestSellerTargets.reduce((sum, target) => sum + target.orderCount, 0) +
    noiseTargets.reduce((sum, target) => sum + target.orderCount, 0);

  console.log(
    `[seed][bulk-orders] Upserting ${buyers.length} seed buyers and ${totalOrders} bulk orders`,
  );

  let orderSequence = 0;

  for (const [rank, target] of bestSellerTargets.entries()) {
    for (let count = 0; count < target.orderCount; count += 1) {
      orderSequence += 1;
      await createSeedOrder({
        em,
        buyer: buyers[(orderSequence + (rank * 11)) % buyers.length],
        candidate: target.candidate,
        orderSequence,
        totalOrders,
      });

      if (orderSequence % ORDER_BATCH_SIZE === 0) {
        await em.flush();
        console.log(
          `[seed][bulk-orders] Processed ${orderSequence}/${totalOrders} orders in ${formatDuration(Date.now() - startedAt)}`,
        );
      }
    }
  }

  for (const [rank, target] of noiseTargets.entries()) {
    for (let count = 0; count < target.orderCount; count += 1) {
      orderSequence += 1;
      await createSeedOrder({
        em,
        buyer: buyers[(orderSequence + (rank * 7)) % buyers.length],
        candidate: target.candidate,
        orderSequence,
        totalOrders,
      });

      if (orderSequence % ORDER_BATCH_SIZE === 0) {
        await em.flush();
        console.log(
          `[seed][bulk-orders] Processed ${orderSequence}/${totalOrders} orders in ${formatDuration(Date.now() - startedAt)}`,
        );
      }
    }
  }

  await em.flush();
  console.log(
    `[seed][bulk-orders] Processed ${orderSequence}/${totalOrders} orders in ${formatDuration(Date.now() - startedAt)}`,
  );
}

async function recreateSeedBuyers(em: EntityManager): Promise<SeedBuyer[]> {
  const existingBuyers = await em.find(UserEntity, {
    email: { $like: `${SEED_BUYER_EMAIL_PREFIX}%` },
  });

  existingBuyers.forEach((buyer) => em.remove(buyer));
  if (existingBuyers.length > 0) {
    await em.flush();
  }

  const customerRole = await em.findOneOrFail(RoleEntity, { key: 'customer' });
  const passwordService = new BcryptPasswordHasher(
    buildAuthConfig({
      get(key: string) {
        return process.env[key];
      },
    }),
  );
  const passwordHash = await passwordService.hash(SEED_BUYER_PASSWORD);
  const verifiedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
  const buyers: SeedBuyer[] = [];

  for (let index = 0; index < SEED_BUYER_COUNT; index += 1) {
    const buyerNumber = String(index + 1).padStart(4, '0');
    const user = em.create(UserEntity, {
      version: 1,
      email: `${SEED_BUYER_EMAIL_PREFIX}${buyerNumber}@example.com`,
      displayName: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[index % LAST_NAMES.length]} ${buyerNumber}`,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: verifiedAt,
    });

    em.persist(user);
    buyers.push({ index, user });
  }

  await em.flush();

  for (const buyer of buyers) {
    em.persist(em.create(UserCredentialEntity, {
      userId: buyer.user.id,
      passwordHash,
      passwordUpdatedAt: verifiedAt,
    }));
    em.persist(em.create(UserRoleEntity, {
      user: buyer.user,
      role: customerRole,
      assignedAt: verifiedAt,
    }));
  }

  await em.flush();
  return buyers;
}

async function loadWeightedTargets(em: EntityManager): Promise<{
  bestSellerTargets: WeightedProductTarget[];
  noiseTargets: WeightedProductTarget[];
}> {
  const products = await em.find(
    ProductEntity,
    { state: ProductState.ACTIVE },
    {
      populate: [
        'shop',
        'images',
        'inventoryRecords',
        'inventoryRecords.prices',
        'inventoryRecords.productVariant',
      ],
    },
  );

  const candidates = products
    .map(toSeedProductCandidate)
    .filter((candidate): candidate is SeedProductCandidate => candidate !== null)
    .sort(compareSeedCandidates);

  if (candidates.length < BEST_SELLER_PRODUCT_COUNT) {
    throw new Error(
      `Need at least ${BEST_SELLER_PRODUCT_COUNT} active storefront-ready products, found ${candidates.length}`,
    );
  }

  const bestSellerTargets = candidates
    .slice(0, BEST_SELLER_PRODUCT_COUNT)
    .map((candidate, index) => ({
      candidate,
      orderCount: BEST_SELLER_TOP_COUNT - (index * BEST_SELLER_COUNT_STEP),
    }));
  const noiseTargets = candidates
    .slice(BEST_SELLER_PRODUCT_COUNT)
    .map((candidate) => ({
      candidate,
      orderCount: NOISE_ORDERS_PER_PRODUCT,
    }));

  return {
    bestSellerTargets,
    noiseTargets,
  };
}

function toSeedProductCandidate(product: ProductEntity): SeedProductCandidate | null {
  const image = product.images.getItems().sort((left, right) => left.rank - right.rank)[0];

  if (!image) {
    return null;
  }

  const inventory = product.inventoryRecords
    .getItems()
    .filter((item) => item.stock > 0)
    .sort((left, right) => {
      if (right.stock !== left.stock) {
        return right.stock - left.stock;
      }

      return (left.sku ?? '').localeCompare(right.sku ?? '');
    })
    .find((item) => getInventoryPricingSnapshot(item) !== undefined);

  if (!inventory) {
    return null;
  }

  const pricing = getInventoryPricingSnapshot(inventory);

  if (!pricing) {
    return null;
  }

  return {
    product,
    inventory,
    image,
    amountMinor: pricing.amountMinor,
    originalAmountMinor: pricing.originalAmountMinor,
    currency: pricing.currency,
  };
}

function compareSeedCandidates(left: SeedProductCandidate, right: SeedProductCandidate): number {
  const leftShopRank = preferredShopRank(left.product.shop.slug);
  const rightShopRank = preferredShopRank(right.product.shop.slug);

  if (leftShopRank !== rightShopRank) {
    return leftShopRank - rightShopRank;
  }

  const shopComparison = left.product.shop.slug.localeCompare(right.product.shop.slug);
  if (shopComparison !== 0) {
    return shopComparison;
  }

  return left.product.title.localeCompare(right.product.title);
}

function preferredShopRank(shopSlug: string): number {
  const index = PREFERRED_SHOP_ORDER.indexOf(shopSlug as typeof PREFERRED_SHOP_ORDER[number]);

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

async function createSeedOrder({
  em,
  buyer,
  candidate,
  orderSequence,
  totalOrders,
}: {
  em: EntityManager;
  buyer: SeedBuyer;
  candidate: SeedProductCandidate;
  orderSequence: number;
  totalOrders: number;
}): Promise<void> {
  const createdAt = buildCreatedAt(orderSequence, totalOrders);
  const isRecentPaidOrder = createdAt.getTime() >= Date.now() - (RECENT_PAID_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const quantity = ((orderSequence + buyer.index) % 6 === 0)
    ? 2
    : 1;
  const shippingFee = SHIPPING_FEES[(orderSequence + buyer.index) % SHIPPING_FEES.length];
  const subtotalMinor = candidate.amountMinor * quantity;
  const subtotal = fromMinor(subtotalMinor, candidate.currency);
  const total = Number((subtotal + shippingFee).toFixed(2));
  const shippingToCountry = candidate.currency === 'GBP' ? 'GB' : 'US';
  const shippingEstimatedDelivery = new Date(createdAt.getTime() + ((isRecentPaidOrder ? 5 : 3) * 24 * 60 * 60 * 1000));

  const order = em.create(OrderEntity, {
    user: buyer.user,
    customerEmail: buyer.user.email,
    shop: candidate.product.shop,
    paymentType: PaymentType.CARD,
    status: isRecentPaidOrder ? OrderStatus.PAID : OrderStatus.COMPLETED,
    shippingStatus: isRecentPaidOrder
      ? OrderShippingStatus.SHIPPED
      : OrderShippingStatus.DELIVERED,
    currency: candidate.currency,
    subtotal,
    subtotalMinor,
    totalShippingFee: shippingFee,
    shippingMinor: toMinor(shippingFee, candidate.currency),
    totalDiscount: 0,
    discountMinor: 0,
    total,
    totalMinor: toMinor(total, candidate.currency),
    note: `Synthetic bestseller seed order ${String(orderSequence).padStart(5, '0')}`,
    promoCodes: [],
    shippingAddress: buildShippingAddress(buyer.index, shippingToCountry),
    shippingOriginCountries: [candidate.currency === 'GBP' ? 'GB' : 'US'],
    shippingToCountry,
    shippingEstimatedDelivery,
    paymentDetails: {
      provider: 'seed',
      checkoutSessionId: `seed-bestseller-${orderSequence}`,
    },
    trackingNumber: isRecentPaidOrder ? `SEEDTRK${String(orderSequence).padStart(7, '0')}` : undefined,
    shippingCarrier: 'seed-carrier',
    shippedAt: isRecentPaidOrder
      ? new Date(createdAt.getTime() + (24 * 60 * 60 * 1000))
      : new Date(createdAt.getTime() + (2 * 24 * 60 * 60 * 1000)),
    deliveredAt: isRecentPaidOrder
      ? undefined
      : new Date(createdAt.getTime() + (6 * 24 * 60 * 60 * 1000)),
    createdAt,
    updatedAt: createdAt,
  });

  em.persist(order);

  em.persist(em.create(OrderItemEntity, {
    order,
    product: candidate.product,
    inventory: candidate.inventory,
    title: candidate.product.title,
    imageUrl: candidate.image.storageKey,
    variantGroupName: candidate.product.variantGroupName,
    variantSubGroupName: candidate.product.variantSubGroupName,
    variantName: candidate.inventory.productVariant?.name,
    price: candidate.originalAmountMinor != null
      ? fromMinor(candidate.originalAmountMinor, candidate.currency)
      : fromMinor(candidate.amountMinor, candidate.currency),
    unitPriceMinor: candidate.amountMinor,
    salePrice: candidate.originalAmountMinor != null
      ? fromMinor(candidate.amountMinor, candidate.currency)
      : undefined,
    originalAmountMinor: candidate.originalAmountMinor,
    quantity,
    lineTotalMinor: subtotalMinor,
    currency: candidate.currency,
    sourceType: 'base_native',
  }));
}

function buildCreatedAt(orderSequence: number, totalOrders: number): Date {
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;
  const spanMs = LOOKBACK_DAYS * dayMs;
  const startMs = Date.now() - spanMs;
  const spacingMs = Math.max(Math.floor(spanMs / Math.max(totalOrders, 1)), 20 * minuteMs);
  const jitterMs = ((orderSequence * 37) % 180) * minuteMs;

  return new Date(startMs + ((orderSequence - 1) * spacingMs) + jitterMs + ((orderSequence % 6) * hourMs));
}

function buildShippingAddress(buyerIndex: number, countryCode: string): Record<string, unknown> {
  const city = CITIES.find((entry) => entry.country === countryCode) ?? CITIES[0];
  const suffix = String((buyerIndex % 9000) + 1000);

  return {
    fullName: `${FIRST_NAMES[buyerIndex % FIRST_NAMES.length]} ${LAST_NAMES[buyerIndex % LAST_NAMES.length]}`,
    phone: `${city.phonePrefix}${suffix}`,
    line1: `${(buyerIndex % 900) + 100} Market Street`,
    line2: `Suite ${(buyerIndex % 40) + 1}`,
    city: city.city,
    state: city.state,
    postalCode: `${city.postalPrefix}${String((buyerIndex % 90) + 10)}`,
    country: city.country,
  };
}

function fromMinor(amountMinor: number, currency: string): number {
  return amountMinor / (10 ** getCurrencyDecimals(currency));
}

function toMinor(amount: number, currency: string): number {
  return Math.round(amount * (10 ** getCurrencyDecimals(currency)));
}

function getCurrencyDecimals(currency: string): number {
  return ['JPY', 'KRW', 'VND'].includes(currency) ? 0 : 2;
}
