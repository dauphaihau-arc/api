import type { EntityManager } from '@mikro-orm/postgresql';
import { CartKind } from '../../../cart/domain/enums/cart-kind.enum';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import {
  CouponCodeNotApplicableError,
  CouponCodeNotFoundError,
  CouponPricingService,
} from './coupon-pricing.service';

function buildCart(): CartSnapshot {
  return {
    id: 'cart-1',
    userId: 'user-1',
    guestSessionId: null,
    kind: CartKind.ACTIVE,
    items: [{
      id: 'item-1',
      quantity: 2,
      isSelectOrder: true,
      updatedAt: new Date('2026-05-20T08:00:00.000Z'),
      inventory: {
        inventoryId: 'inventory-1',
        productId: 'product-1',
        productSlug: 'mug',
        shopId: 'shop-1',
        shopName: 'Clay House',
        shopSlug: 'clay-house',
        title: 'Mug',
        stock: 4,
        currency: 'USD',
        pricing: {
          amountMinor: 1000,
          currency: 'USD',
          sourceCurrency: 'USD',
          sourceUnitAmountMinor: 1000,
        },
        productState: 'active',
      },
    }],
  };
}

function buildService(coupons: object[] = []) {
  const couponRepository = { find: jest.fn().mockResolvedValue(coupons) };
  const usageRepository = { find: jest.fn().mockResolvedValue([]) };
  const entityManager = {
    fork: jest.fn().mockReturnValue({
      getRepository: jest.fn((entity: { name?: string }) =>
        entity?.name === 'CouponEntity' ? couponRepository : usageRepository),
    }),
  } as unknown as EntityManager;
  return { service: new CouponPricingService(entityManager), couponRepository };
}

const activePercentSale = {
  id: 'sale-1',
  code: 'AUTO10',
  shop: { id: 'shop-1' },
  isActive: true,
  isAutoSale: true,
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2027-01-01T00:00:00.000Z'),
  type: 'percentage',
  percentOff: 10,
  appliesTo: 'all',
  appliesProductIds: [],
};

describe('CouponPricingService', () => {
  it('prices eligible items with the active automatic sale', async () => {
    const { service } = buildService([activePercentSale]);
    const [shop] = await service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
    });

    expect(shop?.items[0]?.unitPriceMinor).toBe(900);
    expect(shop?.items[0]?.effectiveUnitPrice).toBe(9);
    expect(shop?.subtotal).toBe(18);
  });

  it('rejects a requested promo code that is absent from the selected shop', async () => {
    const { service } = buildService();

    await expect(service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['MISSING'] }],
      validatePromoCodes: true,
    })).rejects.toBeInstanceOf(CouponCodeNotFoundError);
  });
  it('rejects a promo code when its minimum order value is not met', async () => {
    const { service } = buildService([{
      id: 'promo-1',
      code: 'SAVE10',
      shop: { id: 'shop-1' },
      isActive: true,
      isAutoSale: false,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      maxUses: 100,
      maxUsesPerUser: 3,
      usesCount: 0,
      appliesTo: 'all',
      appliesProductIds: [],
      minOrderType: 'order_total',
      minOrderValue: 50,
      minProducts: 0,
      type: 'percentage',
      percentOff: 10,
      amountOff: 0,
    }]);

    await expect(service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10'] }],
      validatePromoCodes: true,
    })).rejects.toBeInstanceOf(CouponCodeNotApplicableError);
  });
});
