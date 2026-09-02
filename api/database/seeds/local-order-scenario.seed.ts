import type { EntityManager } from '@mikro-orm/postgresql';
import { CouponUsageEntity } from '~/domains/coupon/infra/persistence/entities/coupon-usage.entity';
import { CouponEntity } from '~/domains/coupon/infra/persistence/entities/coupon.entity';
import { CouponAppliesTo } from '~/domains/coupon/domain/enums/coupon-applies-to.enum';
import { CouponMinOrderType } from '~/domains/coupon/domain/enums/coupon-min-order-type.enum';
import { CouponType } from '~/domains/coupon/domain/enums/coupon-type.enum';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
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
import { ORDER_SCENARIOS_LOCAL_TSV_PATH } from './product-seed-paths';
import { readOptionalTsvRows } from './shared/read-tsv-rows';

type LocalOrderScenarioRow = {
  user_email: string;
  order_count: string;
};

type LocalOrderScenario = {
  userEmail: string;
  orderCount: number;
};

type SeedProductCandidate = {
  product: ProductEntity;
  inventory: ProductInventoryEntity;
  image?: ProductImageEntity;
  amountMinor: number;
  currency: string;
};

type ShopBucket = {
  key: string;
  shopSlug: string;
  currency: string;
  candidates: SeedProductCandidate[];
  coupons: CouponEntity[];
};

type SelectedOrderItem = {
  candidate: SeedProductCandidate;
  quantity: number;
};

type OrderLifecycle = {
  status: OrderStatus;
  shippingStatus: OrderShippingStatus;
  note: string;
  shipmentNote?: string;
  cancelReason?: string;
  isRefunded?: boolean;
  isCanceled?: boolean;
};

const LOCAL_ORDER_CHECKOUT_SESSION_PREFIX = 'seed-local-bulk-';
const ORDER_BATCH_SIZE = 20;
const ITEM_COUNT_PATTERN = [1, 2, 3, 4, 5, 1, 3, 2, 4, 5] as const;
const SHIPPING_FEES = [0, 3.5, 5.75, 7.25, 9.5] as const;
const ORDER_LIFECYCLE_PATTERN: readonly OrderLifecycle[] = [
  {
    status: OrderStatus.COMPLETED,
    shippingStatus: OrderShippingStatus.DELIVERED,
    note: 'Local seed order delivered successfully.',
    shipmentNote: 'Delivered with signature confirmation.',
  },
  {
    status: OrderStatus.PAID,
    shippingStatus: OrderShippingStatus.SHIPPED,
    note: 'Local seed order is paid and already shipped.',
    shipmentNote: 'Departed origin facility.',
  },
  {
    status: OrderStatus.COMPLETED,
    shippingStatus: OrderShippingStatus.DELIVERED,
    note: 'Local seed repeat purchase completed.',
    shipmentNote: 'Left with building reception.',
  },
  {
    status: OrderStatus.PAID,
    shippingStatus: OrderShippingStatus.IN_TRANSIT,
    note: 'Local seed order is currently moving through transit hubs.',
    shipmentNote: 'In transit to destination city.',
  },
  {
    status: OrderStatus.PAID,
    shippingStatus: OrderShippingStatus.PRE_TRANSIT,
    note: 'Local seed order is packed and awaiting carrier handoff.',
    shipmentNote: 'Label created and awaiting pickup.',
  },
  {
    status: OrderStatus.REFUNDED,
    shippingStatus: OrderShippingStatus.DELIVERED,
    note: 'Local seed order was refunded after delivery.',
    shipmentNote: 'Delivered before refund was processed.',
    isRefunded: true,
  },
  {
    status: OrderStatus.CANCELED,
    shippingStatus: OrderShippingStatus.PRE_TRANSIT,
    note: 'Local seed order was canceled before shipment.',
    cancelReason: 'Customer requested cancellation before dispatch.',
    isCanceled: true,
  },
  {
    status: OrderStatus.COMPLETED,
    shippingStatus: OrderShippingStatus.DELIVERED,
    note: 'Local seed order completed after coupon redemption.',
    shipmentNote: 'Delivered on the estimated date.',
  },
] as const;

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

function parseScenarioRows(rows: LocalOrderScenarioRow[]): LocalOrderScenario[] {
  return Array.from(
    new Map(
      rows.map((row, index) => {
        const userEmail = row.user_email.trim().toLowerCase();
        const orderCount = Number.parseInt(row.order_count.trim(), 10);

        if (!userEmail) {
          throw new Error(`Missing user_email for local order scenario row ${index + 2}`);
        }

        if (!Number.isInteger(orderCount) || orderCount <= 0) {
          throw new Error(`Invalid order_count "${row.order_count}" for local order scenario ${userEmail}`);
        }

        return [userEmail, {
          userEmail,
          orderCount,
        }];
      }),
    ).values(),
  );
}

function loadLocalOrderScenarios(): LocalOrderScenario[] {
  return parseScenarioRows(
    readOptionalTsvRows<LocalOrderScenarioRow>(ORDER_SCENARIOS_LOCAL_TSV_PATH),
  );
}

function resolveItemCount(orderIndex: number): number {
  return ITEM_COUNT_PATTERN[orderIndex % ITEM_COUNT_PATTERN.length];
}

function toSeedProductCandidate(product: ProductEntity): SeedProductCandidate | null {
  const image = product.images.getItems().sort((left, right) => left.rank - right.rank)[0];
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
    currency: pricing.currency,
  };
}

async function loadShopBuckets(em: EntityManager): Promise<ShopBucket[]> {
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
  const coupons = await em.find(CouponEntity, {}, { populate: ['shop'] });
  const couponsByShopSlug = new Map<string, CouponEntity[]>();

  coupons.forEach((coupon) => {
    const bucket = couponsByShopSlug.get(coupon.shop.slug) ?? [];
    bucket.push(coupon);
    couponsByShopSlug.set(coupon.shop.slug, bucket);
  });

  const buckets = new Map<string, ShopBucket>();

  products
    .map(toSeedProductCandidate)
    .filter((candidate): candidate is SeedProductCandidate => candidate !== null)
    .sort((left, right) => {
      const shopComparison = left.product.shop.slug.localeCompare(right.product.shop.slug);
      if (shopComparison !== 0) {
        return shopComparison;
      }

      return left.product.title.localeCompare(right.product.title);
    })
    .forEach((candidate) => {
      const key = `${candidate.product.shop.slug}::${candidate.currency}`;
      const existing = buckets.get(key) ?? {
        key,
        shopSlug: candidate.product.shop.slug,
        currency: candidate.currency,
        candidates: [],
        coupons: couponsByShopSlug.get(candidate.product.shop.slug) ?? [],
      };
      existing.candidates.push(candidate);
      buckets.set(key, existing);
    });

  return Array.from(buckets.values())
    .filter((bucket) => bucket.candidates.length > 0)
    .sort((left, right) => {
      if (right.candidates.length !== left.candidates.length) {
        return right.candidates.length - left.candidates.length;
      }

      return left.key.localeCompare(right.key);
    });
}

function pickShopBucket(buckets: ShopBucket[], orderIndex: number, itemCount: number): ShopBucket {
  const eligible = buckets.filter((bucket) => bucket.candidates.length >= itemCount);
  const source = eligible.length > 0 ? eligible : buckets;

  return source[orderIndex % source.length];
}

function buildSelectedItems(bucket: ShopBucket, orderIndex: number, itemCount: number): SelectedOrderItem[] {
  const items: SelectedOrderItem[] = [];
  const startIndex = (orderIndex * 3) % bucket.candidates.length;

  for (let offset = 0; offset < itemCount; offset += 1) {
    const candidate = bucket.candidates[(startIndex + offset) % bucket.candidates.length];
    const quantity = (orderIndex + offset) % 5 === 0 ? 2 : 1;

    items.push({
      candidate,
      quantity,
    });
  }

  return items;
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

function roundCurrency(value: number, currency: string): number {
  return Number(value.toFixed(getCurrencyDecimals(currency) === 0 ? 0 : 2));
}

function couponAppliesToOrder(coupon: CouponEntity, items: SelectedOrderItem[], subtotal: number): boolean {
  if (coupon.minProducts > 0 && items.length < coupon.minProducts) {
    return false;
  }

  if (coupon.minOrderType === CouponMinOrderType.ORDER_TOTAL && subtotal < Number(coupon.minOrderValue)) {
    return false;
  }

  if (
    coupon.minOrderType === CouponMinOrderType.NUMBER_OF_PRODUCTS
    && items.length < Number(coupon.minOrderValue)
  ) {
    return false;
  }

  if (coupon.appliesTo !== CouponAppliesTo.SPECIFIC) {
    return true;
  }

  const productIds = new Set(items.map((item) => item.candidate.product.id));
  return coupon.appliesProductIds.some((productId) => productIds.has(productId));
}

function pickCoupon(
  bucket: ShopBucket,
  items: SelectedOrderItem[],
  subtotal: number,
  orderIndex: number,
): CouponEntity | undefined {
  if (orderIndex % 3 !== 0) {
    return undefined;
  }

  return bucket.coupons.find((coupon) => couponAppliesToOrder(coupon, items, subtotal));
}

function calculateCouponDiscount(
  coupon: CouponEntity | undefined,
  subtotal: number,
  shippingFee: number,
  currency: string,
): number {
  if (!coupon) {
    return 0;
  }

  if (coupon.type === CouponType.FIXED_AMOUNT) {
    return roundCurrency(Math.min(subtotal, Number(coupon.amountOff)), currency);
  }

  if (coupon.type === CouponType.PERCENTAGE) {
    return roundCurrency((subtotal * coupon.percentOff) / 100, currency);
  }

  return roundCurrency(shippingFee, currency);
}

function buildCreatedAt(scenarioIndex: number, orderIndex: number, orderCount: number): Date {
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;
  const lookbackDays = Math.max(orderCount * 3, 120);
  const spacingMs = Math.max(
    Math.floor((lookbackDays * dayMs) / Math.max(orderCount, 1)),
    (18 * hourMs),
  );
  const jitterMs = ((((scenarioIndex + 1) * 17) + (orderIndex * 31)) % (6 * hourMs));

  return new Date(
    Date.now() -
      (lookbackDays * dayMs) +
      (orderIndex * spacingMs) +
      jitterMs +
      ((orderIndex % 5) * 15 * minuteMs),
  );
}

function buildShippingAddress(userEmail: string, orderIndex: number): Record<string, unknown> {
  return {
    fullName: 'Hau Tran',
    phone: `+84-28-5550-${String(2000 + (orderIndex % 7000)).padStart(4, '0')}`,
    line1: '11 Hai Ba Trung Street',
    line2: `Apt ${String((orderIndex % 20) + 1)}`,
    city: 'Ho Chi Minh City',
    state: 'District 3',
    postalCode: '700000',
    country: 'Vietnam',
    email: userEmail,
  };
}

function buildTimeline(createdAt: Date, lifecycle: OrderLifecycle) {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const shippingEstimatedDelivery = new Date(createdAt.getTime() + (5 * dayMs));

  if (lifecycle.isCanceled) {
    return {
      shippingEstimatedDelivery,
      shippedAt: undefined,
      deliveredAt: undefined,
      canceledAt: new Date(createdAt.getTime() + (6 * hourMs)),
      refundedAt: undefined,
    };
  }

  if (lifecycle.shippingStatus === OrderShippingStatus.PRE_TRANSIT) {
    return {
      shippingEstimatedDelivery,
      shippedAt: undefined,
      deliveredAt: undefined,
      canceledAt: undefined,
      refundedAt: undefined,
    };
  }

  const shippedAt = new Date(createdAt.getTime() + (24 * hourMs));

  if (lifecycle.shippingStatus === OrderShippingStatus.IN_TRANSIT) {
    return {
      shippingEstimatedDelivery,
      shippedAt,
      deliveredAt: undefined,
      canceledAt: undefined,
      refundedAt: undefined,
    };
  }

  if (lifecycle.shippingStatus === OrderShippingStatus.SHIPPED) {
    return {
      shippingEstimatedDelivery,
      shippedAt,
      deliveredAt: undefined,
      canceledAt: undefined,
      refundedAt: undefined,
    };
  }

  const deliveredAt = new Date(createdAt.getTime() + (4 * dayMs));

  return {
    shippingEstimatedDelivery,
    shippedAt,
    deliveredAt,
    canceledAt: undefined,
    refundedAt: lifecycle.isRefunded
      ? new Date(deliveredAt.getTime() + (2 * dayMs))
      : undefined,
  };
}

export async function seedLocalOrderScenarios(em: EntityManager): Promise<void> {
  const scenarios = loadLocalOrderScenarios();

  if (scenarios.length === 0) {
    return;
  }

  const startedAt = Date.now();
  const totalOrders = scenarios.reduce((sum, scenario) => sum + scenario.orderCount, 0);
  console.log(
    `[seed][local-orders] Upserting ${totalOrders} diversified local orders across ${scenarios.length} scenario(s)`,
  );

  const users = await em.find(UserEntity, {
    email: { $in: scenarios.map((scenario) => scenario.userEmail) },
  });
  const usersByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));

  scenarios.forEach((scenario) => {
    if (!usersByEmail.has(scenario.userEmail)) {
      throw new Error(`Missing seeded user for local order scenario ${scenario.userEmail}`);
    }
  });

  const existingOrders = await em.find(OrderEntity, {}, { populate: ['user'] });
  const localOrdersToDelete = existingOrders.filter((order) => {
    const checkoutSessionId = typeof order.paymentDetails?.checkoutSessionId === 'string'
      ? order.paymentDetails.checkoutSessionId
      : '';

    return checkoutSessionId.startsWith(LOCAL_ORDER_CHECKOUT_SESSION_PREFIX);
  });

  if (localOrdersToDelete.length > 0) {
    const orderIds = localOrdersToDelete.map((order) => order.id);
    await em.nativeDelete(CouponUsageEntity, { orderId: { $in: orderIds } });
    await em.nativeDelete(OrderItemEntity, { order: { $in: orderIds } });
    await em.nativeDelete(OrderEntity, { id: { $in: orderIds } });
  }

  const shopBuckets = await loadShopBuckets(em);
  if (shopBuckets.length === 0) {
    throw new Error('Missing active storefront-ready products for local order scenario seeding');
  }

  let createdOrderCount = 0;

  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    const user = usersByEmail.get(scenario.userEmail);
    if (!user) {
      throw new Error(`Missing seeded user for local order scenario ${scenario.userEmail}`);
    }

    for (let orderIndex = 0; orderIndex < scenario.orderCount; orderIndex += 1) {
      const itemCount = resolveItemCount(orderIndex);
      const bucket = pickShopBucket(shopBuckets, orderIndex + scenarioIndex, itemCount);
      const items = buildSelectedItems(bucket, orderIndex + scenarioIndex, itemCount);
      const createdAt = buildCreatedAt(scenarioIndex, orderIndex, scenario.orderCount);
      const lifecycle = ORDER_LIFECYCLE_PATTERN[(orderIndex + scenarioIndex) % ORDER_LIFECYCLE_PATTERN.length];
      const baseShippingFee = SHIPPING_FEES[(orderIndex + itemCount) % SHIPPING_FEES.length];
      const subtotalMinor = items.reduce(
        (sum, item) => sum + (item.candidate.amountMinor * item.quantity),
        0,
      );
      const subtotal = fromMinor(subtotalMinor, bucket.currency);
      const coupon = pickCoupon(bucket, items, subtotal, orderIndex + scenarioIndex);
      const totalDiscount = calculateCouponDiscount(coupon, subtotal, baseShippingFee, bucket.currency);
      const total = roundCurrency(Math.max(subtotal + baseShippingFee - totalDiscount, 0), bucket.currency);
      const timeline = buildTimeline(createdAt, lifecycle);
      const checkoutSessionId = `${LOCAL_ORDER_CHECKOUT_SESSION_PREFIX}${scenarioIndex + 1}-${orderIndex + 1}`;

      const order = em.create(OrderEntity, {
        user,
        customerEmail: user.email.toString(),
        shop: items[0].candidate.product.shop,
        paymentType: PaymentType.CARD,
        status: lifecycle.status,
        shippingStatus: lifecycle.shippingStatus,
        currency: bucket.currency,
        subtotal,
        subtotalMinor,
        totalShippingFee: baseShippingFee,
        shippingMinor: toMinor(baseShippingFee, bucket.currency),
        totalDiscount,
        discountMinor: toMinor(totalDiscount, bucket.currency),
        total,
        totalMinor: toMinor(total, bucket.currency),
        note: lifecycle.note,
        promoCodes: coupon ? [coupon.code] : [],
        shippingAddress: buildShippingAddress(user.email.toString(), orderIndex),
        shippingOriginCountries: [bucket.currency === 'GBP' ? 'GB' : bucket.currency === 'VND' ? 'VN' : 'US'],
        shippingToCountry: 'VN',
        shippingEstimatedDelivery: timeline.shippingEstimatedDelivery,
        trackingNumber: lifecycle.shippingStatus === OrderShippingStatus.PRE_TRANSIT || lifecycle.isCanceled
          ? undefined
          : `LOCALTRK${String(scenarioIndex + 1).padStart(2, '0')}${String(orderIndex + 1).padStart(4, '0')}`,
        shippingCarrier: lifecycle.isCanceled ? undefined : 'seed-local-carrier',
        shipmentNote: lifecycle.shipmentNote,
        shippedAt: timeline.shippedAt,
        deliveredAt: timeline.deliveredAt,
        canceledAt: timeline.canceledAt,
        cancelReason: lifecycle.cancelReason,
        refundedAt: timeline.refundedAt,
        paymentDetails: {
          provider: 'seed',
          checkoutSessionId,
          scenario: 'local-order-scenario',
        },
        createdAt,
        updatedAt: createdAt,
      });
      em.persist(order);

      items.forEach((item) => {
        const lineTotalMinor = item.candidate.amountMinor * item.quantity;
        const salePrice = undefined;
        const price = fromMinor(item.candidate.amountMinor, bucket.currency);

        em.persist(em.create(OrderItemEntity, {
          order,
          product: item.candidate.product,
          inventory: item.candidate.inventory,
          title: item.candidate.product.title,
          imageUrl: item.candidate.image?.storageKey,
          variantGroupName: item.candidate.product.variantGroupName,
          variantSubGroupName: item.candidate.product.variantSubGroupName,
          variantName: item.candidate.inventory.productVariant?.name,
          price,
          unitPriceMinor: item.candidate.amountMinor,
          salePrice,
          quantity: item.quantity,
          lineTotalMinor,
          currency: bucket.currency,
          sourceType: 'base_native',
          percentCouponCode: coupon?.type === CouponType.PERCENTAGE ? coupon.code : undefined,
          percentCouponPercent: coupon?.type === CouponType.PERCENTAGE ? coupon.percentOff : undefined,
          createdAt,
          updatedAt: createdAt,
        }));
      });

      if (coupon) {
        em.persist(em.create(CouponUsageEntity, {
          coupon,
          user,
          orderId: order.id,
          code: coupon.code,
        }));
      }

      createdOrderCount += 1;
      if (createdOrderCount % ORDER_BATCH_SIZE === 0) {
        await em.flush();
        console.log(
          `[seed][local-orders] Processed ${createdOrderCount}/${totalOrders} orders in ${formatDuration(Date.now() - startedAt)}`,
        );
      }
    }
  }

  await em.flush();
  console.log(
    `[seed][local-orders] Processed ${createdOrderCount}/${totalOrders} orders in ${formatDuration(Date.now() - startedAt)}`,
  );
}
