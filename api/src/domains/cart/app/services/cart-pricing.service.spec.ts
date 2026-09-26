import type { EntityManager } from '@mikro-orm/postgresql';
import { CartKind } from '../../domain/enums/cart-kind.enum';
import type { CartSnapshot } from '../cart.types';
import { CouponPricingService } from '../../../coupon/app/services/coupon-pricing.service';
import { CheckoutShippingUnavailableError } from '../../../order/app/errors/order-app.error';
import { CartPricingService } from './cart-pricing.service';

const cart: CartSnapshot = {
  id: 'cart-1',
  userId: 'user-1',
  guestSessionId: null,
  kind: CartKind.ACTIVE,
  items: [{
    id: 'item-1',
    quantity: 1,
    isSelectOrder: true,
    updatedAt: new Date('2026-09-22T10:00:00.000Z'),
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

describe('CartPricingService', () => {
  it('adds the destination-specific shipping quote to the cart total', async () => {
    const couponRepository = { find: jest.fn().mockResolvedValue([]) };
    const entityManager = {
      fork: jest.fn().mockReturnValue({
        getRepository: jest.fn(() => couponRepository),
      }),
    } as unknown as EntityManager;
    const shippingQuote = {
      anchorAt: new Date('2026-09-22T10:00:00.000Z'),
      unavailable: [],
      shops: [{
        shopId: 'shop-1',
        charge: { currency: 'USD', totalMinor: 500 },
      }],
    };
    const shippingQuoteService = {
      quoteForCheckout: jest.fn().mockResolvedValue(shippingQuote),
      listOriginCountries: jest.fn().mockResolvedValue(['US']),
    };
    const service = new CartPricingService(
      new CouponPricingService(entityManager),
      shippingQuoteService as never,
    );

    const priced = await service.buildPricedCartSummary({
      cart,
      shippingAddress: {
        fullName: 'Jane Doe',
        address1: '123 Main',
        city: 'Austin',
        country: 'US',
        state: 'TX',
        zip: '73301',
        phone: '0123',
      },
    });

    expect(priced.shops[0]?.totalShippingFee).toBe(5);
    expect(priced.totalPrice).toBe(15);
    expect(priced.shippingAnchorAt).toEqual(shippingQuote.anchorAt);
  });
  it('waives quoted shipping with an eligible free-shipping code', async () => {
    const freeShipCoupon = {
      id: 'coupon-free',
      code: 'FREESHIP',
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
      minOrderValue: 0,
      minProducts: 0,
      type: 'free_ship',
      percentOff: 0,
      amountOff: 0,
    };
    const couponRepository = { find: jest.fn().mockResolvedValue([freeShipCoupon]) };
    const entityManager = {
      fork: jest.fn().mockReturnValue({
        getRepository: jest.fn(() => couponRepository),
      }),
    } as unknown as EntityManager;
    const shippingQuoteService = {
      quoteForCheckout: jest.fn().mockResolvedValue({
        anchorAt: new Date('2026-09-22T10:00:00.000Z'),
        unavailable: [],
        shops: [{ shopId: 'shop-1', charge: { currency: 'USD', totalMinor: 500 } }],
      }),
      listOriginCountries: jest.fn().mockResolvedValue(['US']),
    };
    const service = new CartPricingService(
      new CouponPricingService(entityManager),
      shippingQuoteService as never,
    );

    const priced = await service.buildPricedCartSummary({
      cart,
      shippingAddress: {
        fullName: 'Jane Doe',
        address1: '123 Main',
        city: 'Austin',
        country: 'US',
        state: 'TX',
        zip: '73301',
        phone: '0123',
      },
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['FREESHIP'] }],
    });

    expect(priced.shops[0]?.totalShippingFee).toBe(0);
    expect(priced.shops[0]?.totalDiscount).toBe(0);
    expect(priced.shops[0]?.shippingDiscountMinor).toBe(500);
    expect(priced.totalPrice).toBe(10);
  });

  it('rejects pricing when the destination cannot be served', async () => {
    const entityManager = {
      fork: jest.fn().mockReturnValue({
        getRepository: jest.fn(() => ({ find: jest.fn().mockResolvedValue([]) })),
      }),
    } as unknown as EntityManager;
    const shippingQuoteService = {
      quoteForCheckout: jest.fn().mockResolvedValue({
        anchorAt: new Date('2026-09-22T10:00:00.000Z'),
        unavailable: [{ productId: 'product-1', inventoryId: 'inventory-1', quantity: 1 }],
        shops: [],
      }),
      listOriginCountries: jest.fn(),
    };
    const service = new CartPricingService(
      new CouponPricingService(entityManager),
      shippingQuoteService as never,
    );

    await expect(service.buildPricedCartSummary({
      cart,
      shippingAddress: {
        fullName: 'Jane Doe',
        address1: '123 Main',
        city: 'Berlin',
        country: 'DE',
        state: 'BE',
        zip: '10115',
        phone: '0123',
      },
    })).rejects.toBeInstanceOf(CheckoutShippingUnavailableError);
  });
});
