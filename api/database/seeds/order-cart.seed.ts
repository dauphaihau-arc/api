import type { EntityManager } from '@mikro-orm/postgresql';
import type { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { CartKind } from '~/domains/cart/domain/enums/cart-kind.enum';
import { CartEntity } from '~/domains/cart/infra/persistence/entities/cart.entity';
import { CartItemEntity } from '~/domains/cart/infra/persistence/entities/cart-item.entity';
import { PromotionUsageEntity } from '~/domains/promotion/infra/persistence/entities/promotion-usage.entity';
import { PromotionCodeEntity } from '~/domains/promotion/infra/persistence/entities/promotion-code.entity';
import type { PromotionEntity } from '~/domains/promotion/infra/persistence/entities/promotion.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { PromotionBenefitType } from '~/domains/promotion/domain/enums/promotion-benefit-type.enum';
import {
  promotionCodeEntityToPromoOffer,
  type PromoOffer,
} from '~/domains/promotion/app/types/promo-offer.mapper';
import { OrderShippingStatus } from '~/domains/order/domain/enums/order-shipping-status.enum';
import { OrderStatus } from '~/domains/order/domain/enums/order-status.enum';
import { PaymentType } from '~/domains/order/domain/enums/payment-type.enum';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { OrderItemEntity } from '~/domains/order/infra/persistence/entities/order-item.entity';
import { ProductInventoryEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { getInventoryPricingSnapshot } from '~/domains/product/infra/persistence/mikro-orm/reads/variant-price-read';
import { toMinorUnits } from '~/platform/money/money';

type OrderSeed = {
  inventoryId: string;
  quantity: number;
  promoCode?: string;
  shippingFee: number;
  note: string;
};

const DEMO_USER_EMAIL = 'member@example.com';

const CART_ITEMS = [
  { inventoryId: 'olive-tote', quantity: 1 },
  { inventoryId: 'sage-print', quantity: 2 },
];

const ORDER_SEEDS: OrderSeed[] = [
  {
    inventoryId: 'olive-tote',
    quantity: 1,
    promoCode: 'OLIVE-FA',
    shippingFee: 6,
    note: 'Leave at the front desk.',
  },
  {
    inventoryId: 'reed-headphones',
    quantity: 1,
    promoCode: 'REED-PC',
    shippingFee: 0,
    note: 'Call on arrival.',
  },
  {
    inventoryId: 'sage-print',
    quantity: 2,
    shippingFee: 9,
    note: 'Gift wrap if possible.',
  },
];

type SeedInventory = {
  id: string;
  entity: ProductInventoryEntity;
};

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

function calculateUnitPrice(inventory: ProductInventoryEntity): number {
  const pricing = getInventoryPricingSnapshot(inventory);

  if (!pricing) {
    throw new Error(`Missing active base price for seeded inventory ${inventory.id}`);
  }

  return fromMinor(pricing.amountMinor);
}

function buildShippingAddress() {
  return {
    fullName: 'Default Member',
    phone: '+1-202-555-0142',
    line1: '123 Market St',
    line2: 'Apt 4B',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'US',
  };
}

async function loadInventories(em: EntityManager): Promise<Map<string, SeedInventory>> {
  const [oliveTote, reedHeadphones, sagePrint] = await Promise.all([
    em.findOneOrFail(
      ProductInventoryEntity,
      { product: { title: 'Canvas Market Tote' } },
      { populate: ['product', 'product.images', 'product.shop', 'product.shop.ownerUser', 'productVariant', 'prices'] },
    ),
    em.findOneOrFail(
      ProductInventoryEntity,
      { product: { title: 'Sony WH-1000XM6 Wireless Headphones' } },
      { populate: ['product', 'product.images', 'product.shop', 'productVariant', 'prices'] },
    ),
    em.findOneOrFail(
      ProductInventoryEntity,
      { product: { title: 'Minimal Horizon Print' } },
      { populate: ['product', 'product.images', 'product.shop', 'productVariant', 'prices'] },
    ),
  ]);

  return new Map<string, SeedInventory>([
    ['olive-tote', { id: 'olive-tote', entity: oliveTote }],
    ['reed-headphones', { id: 'reed-headphones', entity: reedHeadphones }],
    ['sage-print', { id: 'sage-print', entity: sagePrint }],
  ]);
}

async function loadPromoCodes(
  em: EntityManager,
): Promise<Map<string, { offer: PromoOffer; promotion: PromotionEntity }>> {
  const promotionCodes = await em.find(
    PromotionCodeEntity,
    { code: { $in: ['OLIVE-FA', 'REED-PC'] } },
    { populate: ['promotion', 'promotion.products'] },
  );
  const targetProductIds = [...new Set(promotionCodes.flatMap((code) =>
    code.promotion.products.getItems().map((target) => target.productId)))];
  const targetProducts = targetProductIds.length > 0
    ? await em.find(ProductEntity, { id: { $in: targetProductIds } }, { fields: ['id', 'publicId'] })
    : [];
  const publicIdByProductId = new Map(targetProducts.map((product) => [product.id, product.publicId]));

  return new Map(promotionCodes.map((promotionCode) => [
    promotionCode.code,
    {
      offer: promotionCodeEntityToPromoOffer(
        promotionCode,
        promotionCode.promotion.products.getItems().flatMap((target) => {
          const publicId = publicIdByProductId.get(target.productId);
          return publicId ? [publicId] : [];
        }),
      ),
      promotion: promotionCode.promotion,
    },
  ]));
}

async function resetDemoCommerceData(em: EntityManager, user: UserEntity): Promise<void> {
  const orders = await em.find(OrderEntity, { user });
  const carts = await em.find(CartEntity, { user });

  if (orders.length > 0) {
    await em.nativeDelete(PromotionUsageEntity, { userId: user.id, orderId: { $in: orders.map((order) => order.id) } });
    await em.nativeDelete(OrderItemEntity, { order: { $in: orders.map((order) => order.id) } });
    await em.nativeDelete(OrderEntity, { id: { $in: orders.map((order) => order.id) } });
  }

  if (carts.length > 0) {
    await em.nativeDelete(CartItemEntity, { cart: { $in: carts.map((cart) => cart.id) } });
    await em.nativeDelete(CartEntity, { id: { $in: carts.map((cart) => cart.id) } });
  }
}

export async function seedOrderCartDemo(
  em: EntityManager,
  usersByEmail: Map<string, UserEntity>,
): Promise<void> {
  const startedAt = Date.now();
  const user = usersByEmail.get(DEMO_USER_EMAIL);
  if (!user) {
    throw new Error(`Missing demo user seed: ${DEMO_USER_EMAIL}`);
  }

  await resetDemoCommerceData(em, user);

  const inventories = await loadInventories(em);
  const promoCodesByCode = await loadPromoCodes(em);

  console.log(
    `[seed][demo-commerce] Building ${CART_ITEMS.length} cart items and ${ORDER_SEEDS.length} demo orders`,
  );

  const cart = em.create(CartEntity, {
    user,
    kind: CartKind.ACTIVE,
  });
  em.persist(cart);
  await em.flush();

  for (const cartItemSeed of CART_ITEMS) {
    const inventory = inventories.get(cartItemSeed.inventoryId)?.entity;
    if (!inventory) {
      throw new Error(`Missing demo inventory seed: ${cartItemSeed.inventoryId}`);
    }

    em.persist(
      em.create(CartItemEntity, {
        cart,
        shop: inventory.shop,
        product: inventory.product,
        productInventory: inventory,
        quantity: cartItemSeed.quantity,
        isSelectOrder: true,
      }),
    );
  }

  await em.flush();
  console.log(
    `[seed][demo-commerce] Seeded cart with ${CART_ITEMS.length} items in ${formatDuration(Date.now() - startedAt)}`,
  );

  for (const [index, orderSeed] of ORDER_SEEDS.entries()) {
    const inventory = inventories.get(orderSeed.inventoryId)?.entity;
    if (!inventory) {
      throw new Error(`Missing demo inventory seed: ${orderSeed.inventoryId}`);
    }

    const image = inventory.product.images.getItems().sort((left, right) => left.rank - right.rank)[0];
    const pricing = getInventoryPricingSnapshot(inventory);
    const unitPrice = calculateUnitPrice(inventory);
    const subtotal = unitPrice * orderSeed.quantity;
    const promoEntry = orderSeed.promoCode ? promoCodesByCode.get(orderSeed.promoCode) : undefined;
    const promoOffer = promoEntry?.offer;
    const totalDiscount =
      promoOffer?.benefitType === PromotionBenefitType.FIXED_AMOUNT
        ? Number(promoOffer.amountOff)
        : promoOffer?.benefitType === PromotionBenefitType.PERCENTAGE
          ? Number(((subtotal * promoOffer.percentOff) / 100).toFixed(2))
          : 0;
    const total = Number((subtotal + orderSeed.shippingFee - totalDiscount).toFixed(2));
    const subtotalMinor = toMinorUnits(subtotal, 'USD');
    const shippingMinor = toMinorUnits(orderSeed.shippingFee, 'USD');
    const discountMinor = toMinorUnits(totalDiscount, 'USD');
    const totalMinor = toMinorUnits(total, 'USD');
    const createdAt = new Date(Date.UTC(2026, 4, 10 + (index * 2), 9, 30, 0));

    const order = em.create(OrderEntity, {
      user,
      customerEmail: user.email.toString(),
      shop: inventory.shop,
      paymentType: PaymentType.CARD,
      status: OrderStatus.COMPLETED,
      shippingStatus: OrderShippingStatus.DELIVERED,
      currency: 'USD',
      subtotal,
      subtotalMinor,
      totalShippingFee: orderSeed.shippingFee,
      shippingMinor,
      totalDiscount,
      discountMinor,
      total,
      totalMinor,
      note: orderSeed.note,
      promoCodes: promoOffer ? [promoOffer.code] : [],
      shippingAddress: buildShippingAddress(),
      shippingOriginCountries: ['US'],
      shippingToCountry: 'US',
      shippingEstimatedDelivery: new Date(Date.UTC(2026, 4, 12 + (index * 2), 18, 0, 0)),
      shippedAt: new Date(Date.UTC(2026, 4, 11 + (index * 2), 8, 30, 0)),
      deliveredAt: new Date(Date.UTC(2026, 4, 12 + (index * 2), 12, 0, 0)),
      paymentDetails: {
        provider: 'seed',
        checkoutSessionId: `seed-session-${index + 1}`,
      },
      createdAt,
      updatedAt: createdAt,
    });
    em.persist(order);

    const unitPriceMinor = pricing?.amountMinor ?? toMinorUnits(unitPrice, 'USD');

    em.persist(
      em.create(OrderItemEntity, {
        order,
        product: inventory.product,
        inventory,
        title: inventory.product.title,
        imageUrl: image?.storageKey,
        price: unitPrice,
        salePrice: undefined,
        unitPriceMinor,
        quantity: orderSeed.quantity,
        lineTotalMinor: unitPriceMinor * orderSeed.quantity,
        sourceType: 'base_native',
      }),
    );

    if (promoEntry) {
      em.persist(
        em.create(PromotionUsageEntity, {
          promotion: promoEntry.promotion,
          userId: user.id,
          orderId: order.id,
          code: promoEntry.offer.code,
          createdAt,
          updatedAt: createdAt,
        }),
      );
    }

    await em.flush();
    console.log(
      `[seed][demo-commerce] Processed ${index + 1}/${ORDER_SEEDS.length} demo orders in ${formatDuration(Date.now() - startedAt)}`,
    );
  }
}

function fromMinor(amountMinor: number): number {
  return amountMinor / 100;
}
