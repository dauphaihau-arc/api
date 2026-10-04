import type { EntityManager } from '@mikro-orm/postgresql';
import { MoneyConversionService } from '~/integrations/currency/money-conversion.service';
import { RoundingPolicyService } from '~/integrations/currency/rounding-policy.service';
import { CartKind } from '../../../cart/domain/enums/cart-kind.enum';
import type { CartSnapshot } from '../../../cart/app/cart.types';
import { MikroOrmCouponRepository } from '../../infra/persistence/repositories/mikro-orm-coupon.repository';
import {
  CouponCodeNotApplicableError,
  CouponCodeNotFoundError,
  CouponCurrencyConversionUnavailableError,
  CouponSlotConflictError,
} from '../errors/coupon-app.error';
import { CouponPricingService } from './coupon-pricing.service';
import { CouponPresentmentService } from './coupon-presentment.service';

function buildCart(input: { currency?: string; amountMinor?: number; quantity?: number } = {}): CartSnapshot {
  const currency = input.currency ?? 'USD';
  const amountMinor = input.amountMinor ?? 1000;

  return {
    id: 'cart-1',
    userId: 'user-1',
    guestSessionId: null,
    kind: CartKind.ACTIVE,
    items: [{
      id: 'item-1',
      quantity: input.quantity ?? 2,
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
        currency,
        pricing: {
          amountMinor,
          currency,
          sourceCurrency: currency,
          sourceUnitAmountMinor: amountMinor,
        },
        productState: 'active',
      },
    }],
  };
}

/**
 * A real `MoneyConversionService` over a fixed rate table, so coupon resolution
 * exercises the same scaling, rounding policy, and identity rules production
 * uses; a rate the map does not hold means "no rate available".
 */
function buildMoneyConversionService(rates: Record<string, string>) {
  const fxRateService = {
    getLatestRate: jest.fn(async (input: { fromCurrency: string; toCurrency: string; at?: Date }) => {
      if (input.fromCurrency === input.toCurrency) {
        return {
          fromCurrency: input.fromCurrency,
          toCurrency: input.toCurrency,
          rate: '1',
          effectiveAt: input.at ?? new Date(),
          source: 'identity',
        };
      }

      const rate = rates[`${input.fromCurrency}:${input.toCurrency}`];

      if (!rate) {
        return null;
      }

      return {
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        rate,
        effectiveAt: new Date('2026-09-22T00:00:00.000Z'),
        source: 'test-rates',
      };
    }),
  };

  return new MoneyConversionService(fxRateService as never, new RoundingPolicyService());
}

function buildService(
  coupons: object[] = [],
  rates: Record<string, string> = {},
  userUsages: object[] = [],
  salesByProductId: Map<string, { promotionId: string; percentOff: number }> = new Map(),
  promotionOffers: object[] = [],
  promotionUserUsages: Map<string, number> = new Map(),
) {
  const couponRepository = { find: jest.fn().mockResolvedValue(coupons) };
  const usageRepository = { find: jest.fn().mockResolvedValue(userUsages) };
  const saleProjectionReader = {
    findBestSalesForProducts: jest.fn().mockResolvedValue(salesByProductId),
  };
  const promotionCodeReader = {
    findActiveCheckoutDiscounts: jest.fn().mockResolvedValue(promotionOffers),
    countUsagesByUser: jest.fn().mockResolvedValue(promotionUserUsages),
  };
  const entityManager = {
    fork: jest.fn().mockReturnValue({
      getRepository: jest.fn((entity: { name?: string }) =>
        entity?.name === 'CouponEntity' ? couponRepository : usageRepository),
    }),
  } as unknown as EntityManager;
  return {
    service: new CouponPricingService(
      new MikroOrmCouponRepository(entityManager),
      new CouponPresentmentService(buildMoneyConversionService(rates)),
      saleProjectionReader as never,
      promotionCodeReader as never,
    ),
    couponRepository,
  };
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
  visibility: 'code_only',
  currency: 'USD',
};

function buildPromo(overrides: Record<string, unknown>) {
  return {
    id: `promo-${String(overrides.code)}`,
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
    minOrderType: 'none',
    minOrderValue: 0,
    minProducts: 0,
    type: 'percentage',
    percentOff: 10,
    amountOff: 0,
    visibility: 'code_only',
    currency: 'USD',
    ...overrides,
  };
}

/**
 * A Promotion-backed Checkout Discount offer, shaped exactly as the read port
 * returns it: the real reader already filtered the schedule, cancellation and
 * end state, so a test only varies what discovery should react to.
 */
function buildPromotionOffer(overrides: Record<string, unknown> = {}) {
  return {
    promotionId: `promotion-${String(overrides.code ?? 'OFFER')}`,
    shopId: 'shop-1',
    code: 'OFFER10',
    benefitType: 'percentage',
    percentOff: 10,
    amountOff: 0,
    currency: 'USD',
    visibility: 'public',
    productScope: 'all',
    productIds: [],
    minOrderType: 'none',
    minOrderValue: 0,
    minPurchaseQuantity: 0,
    maxRedemptions: null,
    maxRedemptionsPerBuyer: null,
    usesCount: 0,
    startAt: new Date('2026-01-01T00:00:00.000Z'),
    endAt: new Date('2027-01-01T00:00:00.000Z'),
    timezone: 'UTC',
    ...overrides,
  };
}

// eslint-disable-next-line max-lines-per-function
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

  it('applies a Promotion Sale and lets the highest reduction win over an automatic sale coupon', async () => {
    const { service } = buildService(
      [activePercentSale],
      {},
      [],
      new Map([['product-1', { promotionId: 'promotion-1', percentOff: 35 }]]),
    );
    const [shop] = await service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
    });

    // 35% off 10.00 beats the 10% automatic sale coupon; Sales never compound.
    expect(shop?.items[0]?.unitPriceMinor).toBe(650);
    expect(shop?.items[0]?.effectiveUnitPrice).toBe(6.5);
    expect(shop?.items[0]?.autoSaleCoupon).toBeUndefined();
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
    const { service } = buildService([
      buildPromo({ code: 'SAVE10', minOrderType: 'order_total', minOrderValue: 50 }),
    ]);

    await expect(service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10'] }],
      validatePromoCodes: true,
    })).rejects.toBeInstanceOf(CouponCodeNotApplicableError);
  });

  it('rejects two merchandise coupons in the same slot even without promo validation', async () => {
    const { service } = buildService([
      buildPromo({ code: 'SAVE10' }),
      buildPromo({ code: 'SAVE20', percentOff: 20 }),
    ]);

    await expect(service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10', 'SAVE20'] }],
    })).rejects.toBeInstanceOf(CouponSlotConflictError);
  });

  it('combines one shipping and one merchandise coupon', async () => {
    const { service } = buildService([
      buildPromo({ code: 'SAVE10' }),
      buildPromo({ code: 'FREESHIP', type: 'free_ship', percentOff: 0 }),
    ]);

    const [shop] = await service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10', 'FREESHIP'] }],
      validatePromoCodes: true,
    });

    expect(shop?.promoOffers.map((offer) => offer.code).sort()).toEqual(['FREESHIP', 'SAVE10']);
  });

  it('waives the quoted Shipping Charge for an eligible free-shipping promo code', async () => {
    const { service } = buildService([], {}, [], new Map(), [
      buildPromotionOffer({ code: 'FREESHIPQ', benefitType: 'free_shipping', percentOff: 0 }),
    ]);

    const [shop] = await service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['FREESHIPQ'] }],
      validatePromoCodes: true,
      shippingShops: [{
        shopId: 'shop-1',
        currency: 'USD',
        charge: { totalMinor: 500 },
        estimate: {},
        units: [],
      }] as never,
    });

    expect(shop?.shippingDiscountMinor).toBe(500);
    expect(shop?.shippingDiscounts).toEqual([
      expect.objectContaining({ code: 'FREESHIPQ', waivedMinor: 500, type: 'free_ship' }),
    ]);
    expect(shop?.totalDiscount).toBe(0);
  });

  it('treats an already-free quoted Shipping Charge as zero benefit', async () => {
    const { service } = buildService([], {}, [], new Map(), [
      buildPromotionOffer({ code: 'FREEFREE', benefitType: 'free_shipping', percentOff: 0 }),
    ]);
    const shippingShops = [{
      shopId: 'shop-1',
      currency: 'USD',
      charge: { totalMinor: 0 },
      estimate: {},
      units: [],
    }] as never;

    await expect(service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['FREEFREE'] }],
      validatePromoCodes: true,
      shippingShops,
    })).rejects.toBeInstanceOf(CouponCodeNotApplicableError);

    const [shop] = await service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['FREEFREE'] }],
      shippingShops,
    });

    expect(shop?.promoOffers).toEqual([]);
    expect(shop?.shippingDiscountMinor).toBe(0);
    expect(shop?.shippingDiscounts).toEqual([]);
  });

  it('accepts a free-shipping code before a Shipping Charge is quoted', async () => {
    const { service } = buildService([], {}, [], new Map(), [
      buildPromotionOffer({ code: 'FREEYET', benefitType: 'free_shipping', percentOff: 0 }),
    ]);

    const [shop] = await service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['FREEYET'] }],
      validatePromoCodes: true,
    });

    expect(shop?.promoOffers.map((offer) => offer.code)).toEqual(['FREEYET']);
    expect(shop?.shippingDiscountMinor).toBe(0);
  });

  it('returns discoverable public coupons and hides code_only and auto-sale coupons', async () => {
    const { service } = buildService([
      buildPromo({ code: 'SAVE10', visibility: 'public' }),
      buildPromo({ code: 'HIDDEN', visibility: 'code_only' }),
      activePercentSale,
    ]);

    const coupons = await service.listDiscoverableCoupons({
      cart: buildCart(),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });

    expect(coupons.map((coupon) => coupon.code)).toEqual(['SAVE10']);
    expect(coupons[0]).toMatchObject({
      currency: 'USD',
      isEligible: true,
      ineligibleReason: null,
    });
  });

  it('returns a public coupon scoped away from the cart flagged product_scope', async () => {
    const { service } = buildService([
      buildPromo({
        code: 'MUGONLY',
        visibility: 'public',
        appliesTo: 'specific',
        appliesProductIds: ['product-2'],
      }),
    ]);

    const coupons = await service.listDiscoverableCoupons({
      cart: buildCart(),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });

    expect(coupons).toHaveLength(1);
    expect(coupons[0]).toMatchObject({
      code: 'MUGONLY',
      isEligible: false,
      ineligibleReason: 'product_scope',
    });
  });

  it('returns a public coupon below the converted minimum flagged min_order_value', async () => {
    const { service } = buildService([
      buildPromo({
        code: 'MIN120USD',
        currency: 'USD',
        minOrderType: 'order_total',
        minOrderValue: 120,
        visibility: 'public',
      }),
      buildPromo({
        code: 'SAVE12USD',
        currency: 'USD',
        type: 'fixed_amount',
        percentOff: 0,
        amountOff: 10,
        visibility: 'public',
      }),
    ], { 'USD:VND': '24803' });

    const coupons = await service.listDiscoverableCoupons({
      cart: buildCart({ currency: 'VND', amountMinor: 500000, quantity: 1 }),
      shopId: 'shop-1',
      checkoutCurrency: 'VND',
    });

    // 120 USD converts to 2,976,360 VND, far above the 500,000 VND cart.
    expect(coupons.map((coupon) => coupon.code)).toEqual(['SAVE12USD', 'MIN120USD']);
    expect(coupons[1]).toMatchObject({
      code: 'MIN120USD',
      isEligible: false,
      ineligibleReason: 'min_order_value',
      minOrderValue: 2976360,
      currency: 'VND',
    });
  });

  it('flags a cart that misses the product-count minimum with min_products', async () => {
    const { service } = buildService([
      buildPromo({
        code: 'THREEMUGS',
        visibility: 'public',
        minOrderType: 'number_of_products',
        minProducts: 5,
      }),
    ]);

    const coupons = await service.listDiscoverableCoupons({
      cart: buildCart({ quantity: 2 }),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });

    expect(coupons[0]).toMatchObject({
      code: 'THREEMUGS',
      isEligible: false,
      ineligibleReason: 'min_products',
    });
  });

  it('flags not-started, inactive, and use-limited public coupons', async () => {
    const { service } = buildService([
      buildPromo({ code: 'FUTURE', visibility: 'public', startDate: new Date('2027-06-01T00:00:00.000Z') }),
      buildPromo({ code: 'INACTIVE', visibility: 'public', isActive: false }),
      buildPromo({
        code: 'MAXED', visibility: 'public', maxUses: 1, usesCount: 1, 
      }),
      buildPromo({ code: 'LIMME', visibility: 'public', maxUsesPerUser: 1 }),
    ], {}, [{ coupon: { id: 'promo-LIMME' } }]);

    const coupons = await service.listDiscoverableCoupons({
      userId: 'user-1',
      cart: buildCart(),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });

    expect(coupons.map((coupon) => [coupon.code, coupon.ineligibleReason])).toEqual([
      ['FUTURE', 'not_started'],
      ['INACTIVE', 'inactive'],
      ['LIMME', 'user_usage_limit_reached'],
      ['MAXED', 'usage_limit_reached'],
    ]);
  });

  it('excludes an expired public coupon from the listing while apply still rejects it', async () => {
    const { service } = buildService([
      buildPromo({ code: 'EXPIRED', visibility: 'public', endDate: new Date('2026-02-01T00:00:00.000Z') }),
      buildPromo({ code: 'SAVE10', visibility: 'public' }),
    ]);

    const coupons = await service.listDiscoverableCoupons({
      cart: buildCart(),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });

    expect(coupons.map((coupon) => coupon.code)).toEqual(['SAVE10']);

    await expect(service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['EXPIRED'] }],
      validatePromoCodes: true,
    })).rejects.toBeInstanceOf(CouponCodeNotApplicableError);
  });

  it('orders eligible coupons before ineligible ones, by code within each group', async () => {
    const { service } = buildService([
      buildPromo({ code: 'ZED', visibility: 'public' }),
      buildPromo({ code: 'ALPHA', visibility: 'public' }),
      buildPromo({
        code: 'BETA',
        visibility: 'public',
        appliesTo: 'specific',
        appliesProductIds: ['product-2'],
      }),
      buildPromo({
        code: 'AMBER',
        visibility: 'public',
        appliesTo: 'specific',
        appliesProductIds: ['product-2'],
      }),
    ]);

    const coupons = await service.listDiscoverableCoupons({
      cart: buildCart(),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });

    expect(coupons.map((coupon) => coupon.code)).toEqual(['ALPHA', 'ZED', 'AMBER', 'BETA']);
    expect(coupons.map((coupon) => coupon.isEligible)).toEqual([true, true, false, false]);
  });

  it('lists active public Promotion-backed codes and excludes code_only and globally exhausted ones', async () => {
    const { service } = buildService([], {}, [], new Map(), [
      buildPromotionOffer({ code: 'PUBLIC10' }),
      buildPromotionOffer({ code: 'HIDDEN10', visibility: 'code_only' }),
      buildPromotionOffer({ code: 'MAXED10', maxRedemptions: 1, usesCount: 1 }),
    ]);

    const codes = await service.listDiscoverableCoupons({
      cart: buildCart(),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });

    expect(codes.map((coupon) => coupon.code)).toEqual(['PUBLIC10']);
    expect(codes[0]).toMatchObject({
      code: 'PUBLIC10',
      type: 'percentage',
      appliesTo: 'all',
      percentOff: 10,
      currency: 'USD',
      isEligible: true,
      ineligibleReason: null,
    });
  });

  it('attaches the evaluator reason when an exhausted Promotion-backed code is rejected', async () => {
    const { service } = buildService([], {}, [], new Map(), [
      buildPromotionOffer({ code: 'MAXED10', maxRedemptions: 1, usesCount: 1 }),
    ]);

    await expect(service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['MAXED10'] }],
      validatePromoCodes: true,
    })).rejects.toMatchObject({ reason: 'usage_limit_reached' });
  });

  it('flags a Promotion-backed code scoped away from the cart with product_scope', async () => {
    const { service } = buildService([], {}, [], new Map(), [
      buildPromotionOffer({
        code: 'MUGONLY',
        productScope: 'specific',
        productIds: ['product-2'],
      }),
    ]);

    const codes = await service.listDiscoverableCoupons({
      cart: buildCart(),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });

    expect(codes[0]).toMatchObject({
      code: 'MUGONLY',
      isEligible: false,
      ineligibleReason: 'product_scope',
    });
  });

  it('flags a Promotion-backed code the buyer has already used with user_usage_limit_reached', async () => {
    const { service } = buildService([], {}, [], new Map(), [
      buildPromotionOffer({
        code: 'LIMME',
        promotionId: 'promotion-LIMME',
        maxRedemptionsPerBuyer: 1,
      }),
    ], new Map([['promotion-LIMME', 1]]));

    const codes = await service.listDiscoverableCoupons({
      userId: 'user-1',
      cart: buildCart(),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });

    expect(codes[0]).toMatchObject({
      code: 'LIMME',
      isEligible: false,
      ineligibleReason: 'user_usage_limit_reached',
    });
  });

  it('flags a per-buyer Promotion-backed code for a signed-out buyer with authentication_required', async () => {
    const { service } = buildService([], {}, [], new Map(), [
      buildPromotionOffer({
        code: 'LIMGUEST',
        promotionId: 'promotion-LIMGUEST',
        maxRedemptionsPerBuyer: 1,
      }),
    ]);

    const codes = await service.listDiscoverableCoupons({
      cart: buildCart(),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });

    expect(codes[0]).toMatchObject({
      code: 'LIMGUEST',
      isEligible: false,
      ineligibleReason: 'authentication_required',
    });
  });

  it('flags a code that rounds to no saving and rejects it on apply', async () => {
    const { service } = buildService([], {}, [], new Map(), [
      buildPromotionOffer({ code: 'ZERO', percentOff: 0 }),
    ]);

    const codes = await service.listDiscoverableCoupons({
      cart: buildCart(),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });
    expect(codes[0]).toMatchObject({
      code: 'ZERO',
      isEligible: false,
      ineligibleReason: 'zero_benefit',
    });

    // The apply path rejects the same offer, so nothing is ever consumed.
    await expect(service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['ZERO'] }],
      validatePromoCodes: true,
    })).rejects.toBeInstanceOf(CouponCodeNotApplicableError);
  });

  it('replaces a Promotion-backed product code in the discount slot', async () => {
    const { service } = buildService([], {}, [], new Map(), [
      buildPromotionOffer({ code: 'FIRST10', promotionId: 'promotion-FIRST10' }),
      buildPromotionOffer({
        code: 'SECOND20',
        promotionId: 'promotion-SECOND20',
        percentOff: 20,
      }),
    ]);

    const codes = await service.addPromoCode({
      cart: buildCart(),
      shopId: 'shop-1',
      code: 'second20',
      retainedPromoCodes: ['FIRST10'],
    });

    expect(codes).toEqual([{ code: 'SECOND20', type: 'percentage' }]);
  });

  it('lists nothing for a shop with no selected items', async () => {
    const { service, couponRepository } = buildService([
      buildPromo({ code: 'SAVE10', visibility: 'public' }),
    ]);

    const coupons = await service.listDiscoverableCoupons({
      cart: buildCart(),
      shopId: 'shop-2',
      checkoutCurrency: 'USD',
    });

    expect(coupons).toEqual([]);
    expect(couponRepository.find).not.toHaveBeenCalled();
  });

  it('replaces the retained coupon in the same slot and redeems code-only coupons', async () => {
    const { service } = buildService([
      buildPromo({ code: 'SAVE10' }),
      buildPromo({ code: 'SAVE20', percentOff: 20 }),
      buildPromo({ code: 'FREESHIP', type: 'free_ship', percentOff: 0 }),
    ]);

    const codes = await service.addPromoCode({
      cart: buildCart(),
      shopId: 'shop-1',
      code: 'save20',
      retainedPromoCodes: ['SAVE10', 'FREESHIP'],
    });

    expect(codes).toEqual([
      { code: 'SAVE20', type: 'percentage' },
      { code: 'FREESHIP', type: 'free_ship' },
    ]);
  });

  it('rejects adding an unknown coupon code', async () => {
    const { service } = buildService([]);

    await expect(service.addPromoCode({
      cart: buildCart(),
      shopId: 'shop-1',
      code: 'MISSING',
      retainedPromoCodes: [],
    })).rejects.toBeInstanceOf(CouponCodeNotFoundError);
  });

  it('converts an order-total minimum before comparing it to the presentment subtotal', async () => {
    // 120 USD is ~2,976,360 VND; a 500,000 VND cart is far below it, though the
    // raw numbers would wrongly pass a native-value comparison.
    const { service } = buildService([buildPromo({
      code: 'MIN120USD',
      currency: 'USD',
      minOrderType: 'order_total',
      minOrderValue: 120,
    })], { 'USD:VND': '24803' });

    await expect(service.applyToCart({
      cart: buildCart({ currency: 'VND', amountMinor: 500000, quantity: 1 }),
      checkoutCurrency: 'VND',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['MIN120USD'] }],
      validatePromoCodes: true,
    })).rejects.toBeInstanceOf(CouponCodeNotApplicableError);
  });

  it('lists a foreign-currency coupon with its minimum converted into the checkout currency', async () => {
    const { service } = buildService([buildPromo({
      code: 'MIN10USD',
      currency: 'USD',
      minOrderType: 'order_total',
      minOrderValue: 10,
      visibility: 'public',
    })], { 'USD:VND': '24803' });

    const coupons = await service.listDiscoverableCoupons({
      cart: buildCart({ currency: 'VND', amountMinor: 500000, quantity: 1 }),
      shopId: 'shop-1',
      checkoutCurrency: 'VND',
    });

    expect(coupons.map((coupon) => coupon.code)).toEqual(['MIN10USD']);
    expect(coupons[0]?.currency).toBe('VND');
    expect(coupons[0]?.minOrderValue).toBe(248030);
  });

  it('converts a fixed-amount discount into the checkout currency', async () => {
    const { service } = buildService([buildPromo({
      code: 'SAVE10USD',
      currency: 'USD',
      type: 'fixed_amount',
      percentOff: 0,
      amountOff: 10,
    })], { 'USD:VND': '24803' });

    const [shop] = await service.applyToCart({
      cart: buildCart({ currency: 'VND', amountMinor: 500000, quantity: 1 }),
      checkoutCurrency: 'VND',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10USD'] }],
      validatePromoCodes: true,
    });

    expect(shop?.totalDiscount).toBe(248030);
  });

  it('treats a zero-decimal currency coupon as identity in the same checkout currency', async () => {
    const { service } = buildService([buildPromo({
      code: 'JPYMIN',
      currency: 'JPY',
      minOrderType: 'order_total',
      minOrderValue: 100,
      visibility: 'public',
    })]);

    const [shop] = await service.applyToCart({
      cart: buildCart({ currency: 'JPY', amountMinor: 500, quantity: 1 }),
      checkoutCurrency: 'JPY',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['JPYMIN'] }],
      validatePromoCodes: true,
    });

    expect(shop?.promoOffers.map((offer) => offer.code)).toEqual(['JPYMIN']);
  });

  it('fails a requested coupon whose currency has no rate instead of treating it as the checkout currency', async () => {
    const { service } = buildService([buildPromo({
      code: 'JPYMIN',
      currency: 'JPY',
      minOrderType: 'order_total',
      minOrderValue: 100,
      visibility: 'public',
    })]);

    await expect(service.applyToCart({
      cart: buildCart(),
      checkoutCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['JPYMIN'] }],
      validatePromoCodes: true,
    })).rejects.toBeInstanceOf(CouponCurrencyConversionUnavailableError);

    const coupons = await service.listDiscoverableCoupons({
      cart: buildCart(),
      shopId: 'shop-1',
      checkoutCurrency: 'USD',
    });

    expect(coupons).toEqual([]);
  });
});
