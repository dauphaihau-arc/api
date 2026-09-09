import type { EntityManager } from '@mikro-orm/postgresql';
import { OrderTotalLimitExceededError } from '../../../order/app/errors/order-app.error';
import type { CheckoutStockReservationPort } from '../ports/checkout-stock-reservation.port';
import type { CheckoutQuoteRepository } from '../ports/checkout-quote.repository';
import { CreateCheckoutQuoteService } from './create-checkout-quote.service';
import type { CouponPricingService } from '../../../coupon/app/services/coupon-pricing.service';
import type { StorefrontMarketContextService } from '../../../product/app/services/storefront-market-context.service';
import type { OrderTotalPolicyService } from '../../../order/app/services/order-total-policy.service';
import type { PurchaseEligibilityService } from '../../../product/app/services/purchase-eligibility.service';
import type { JobDispatcher } from '../../../../integrations/queue/app/ports/job-dispatcher';

describe('CreateCheckoutQuoteService', () => {
  it('rejects quote creation when the total exceeds the currency-specific limit', async () => {
    const quoteRepository = {
      create: jest.fn(),
    };
    const quoteItemRepository = {
      create: jest.fn(),
    };
    const forkedEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'CheckoutQuoteEntity':
            return quoteRepository;
          case 'CheckoutQuoteItemEntity':
            return quoteItemRepository;
          default:
            return { create: jest.fn() };
        }
      }),
      persist: jest.fn(),
      flush: jest.fn(),
      getReference: jest.fn(),
    };
    const entityManager = {
      fork: jest.fn(() => forkedEntityManager),
      transactional: jest.fn(),
    } as unknown as EntityManager;
    const couponPricingService = {
      buildPricedCartSummary: jest.fn().mockResolvedValue({
        shops: [
          {
            shopId: 'shop-1',
            shopName: 'Shop 1',
            items: [
              {
                inventoryId: 'inventory-1',
                productId: 'product-1',
                shopId: 'shop-1',
                shopName: 'Shop 1',
                shopSlug: 'shop-1',
                title: 'Product 1',
                imageUrl: 'https://example.com/product.png',
                quantity: 1,
                currency: 'VND',
                price: 250000000,
                baseUnitPrice: 250000000,
                effectiveUnitPrice: 250000000,
              },
            ],
            subtotal: 250000000,
            totalDiscount: 0,
            totalShippingFee: 0,
            total: 250000000,
            note: undefined,
            promoCoupons: [],
            originCountries: ['VN'],
          },
        ],
        currency: 'VND',
        subtotalPrice: 250000000,
        totalDiscount: 0,
        subtotalAfterDiscount: 250000000,
        totalShippingFee: 0,
        totalPrice: 250000000,
        totalSelectedQuantity: 1,
        totalQuantity: 1,
      }),
    } as unknown as jest.Mocked<CouponPricingService>;
    const storefrontMarketContextService = {
      resolveCurrentRequest: jest.fn().mockResolvedValue({
        currency: 'VND',
        marketCode: 'VN',
      }),
    } as unknown as jest.Mocked<StorefrontMarketContextService>;
    const orderTotalPolicyService = {
      assertWithinLimit: jest.fn(() => {
        throw new OrderTotalLimitExceededError('VND');
      }),
    } as unknown as jest.Mocked<OrderTotalPolicyService>;
    const checkoutStockReservationService = {
      reserveForQuote: jest.fn().mockResolvedValue({
        reservationId: 'reservation-remote-1',
      }),
    } as unknown as jest.Mocked<CheckoutStockReservationPort>;
    const purchaseEligibilityService = {
      evaluate: jest.fn().mockResolvedValue({ eligible: true, failures: [] }),
    } as unknown as jest.Mocked<PurchaseEligibilityService>;
    const checkoutQuoteRepository = {
      findReusable: jest.fn(),
    } as unknown as jest.Mocked<CheckoutQuoteRepository>;
    const jobDispatcher = {
      dispatch: jest.fn(),
    } as unknown as jest.Mocked<JobDispatcher>;

    const service = new CreateCheckoutQuoteService(
      entityManager,
      checkoutQuoteRepository,
      couponPricingService,
      storefrontMarketContextService,
      orderTotalPolicyService,
      checkoutStockReservationService,
      purchaseEligibilityService,
      jobDispatcher,
    );

    await expect(
      service.createFromCart({
        actor: {
          type: 'guest',
          guestSessionId: 'guest-1',
        },
        cart: {
          id: 'cart-1',
          userId: null,
          guestSessionId: 'guest-1',
          kind: 'active' as never,
          items: [],
        },
        shippingAddress: {
          fullName: 'Jane Doe',
          address1: '123 Main',
          address2: '',
          city: 'HCMC',
          country: 'VN',
          state: 'HCM',
          zip: '700000',
          phone: '0123',
        },
      }),
    ).rejects.toThrow(OrderTotalLimitExceededError);

    expect(orderTotalPolicyService.assertWithinLimit).toHaveBeenCalledWith({
      totalMinor: 250000000,
      currency: 'VND',
    });
    expect(quoteRepository.create).not.toHaveBeenCalled();
    expect(quoteItemRepository.create).not.toHaveBeenCalled();
    expect(forkedEntityManager.persist).not.toHaveBeenCalled();
    expect(forkedEntityManager.flush).not.toHaveBeenCalled();
  });

  it('reuses an active quote with the same fingerprint instead of recreating reservations', async () => {
    const existingQuote = {
      id: 'quote-1',
      quoteFingerprint: 'fingerprint-1',
      checkoutCurrency: 'USD',
      subtotalMinor: 1500,
      shippingMinor: 200,
      discountMinor: 100,
      totalMinor: 1600,
      expiresAt: new Date('2026-06-27T01:00:00.000Z'),
      pricedShops: [
        {
          shop_id: 'shop-1',
          shop_name: 'Shop 1',
          shop_slug: 'shop-1',
          subtotal_minor: 1500,
          discount_minor: 100,
          shipping_minor: 200,
          total_minor: 1600,
          promo_codes: ['SAVE10'],
          origin_countries: ['US'],
          items: [
            {
              inventory_id: 'inventory-1',
              product_id: 'product-1',
              shop_id: 'shop-1',
              shop_name: 'Shop 1',
              shop_slug: 'shop-1',
              title: 'Product 1',
              quantity: 1,
              source_currency: 'USD',
              unit_price_source_minor: 1500,
              line_total_source_minor: 1500,
              checkout_currency: 'USD',
              unit_price_checkout_minor: 1500,
              line_total_checkout_minor: 1500,
              unit_price_minor: 1500,
              line_total_minor: 1500,
              currency: 'USD',
            },
          ],
        },
      ],
    };
    const checkoutQuoteRepository = {
      findReusable: jest.fn().mockResolvedValue(existingQuote),
    } as unknown as jest.Mocked<CheckoutQuoteRepository>;
    const quoteRepository = {
      create: jest.fn(),
    };
    const quoteItemRepository = {
      create: jest.fn(),
    };
    const transactionalEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'CheckoutQuoteEntity':
            return quoteRepository;
          case 'CheckoutQuoteItemEntity':
            return quoteItemRepository;
          default:
            return {};
        }
      }),
      persist: jest.fn(),
      flush: jest.fn(),
      getReference: jest.fn(),
    };
    const entityManager = {
      transactional: jest.fn(async (work: (em: EntityManager) => Promise<unknown>) =>
        work(transactionalEntityManager as unknown as EntityManager)),
    } as unknown as EntityManager;
    const couponPricingService = {
      buildPricedCartSummary: jest.fn().mockResolvedValue({
        shops: [
          {
            shopId: 'shop-1',
            shopName: 'Shop 1',
            items: [
              {
                inventoryId: 'inventory-1',
                productId: 'product-1',
                shopId: 'shop-1',
                shopName: 'Shop 1',
                shopSlug: 'shop-1',
                title: 'Product 1',
                quantity: 1,
                currency: 'USD',
                price: 15,
                effectiveUnitPrice: 15,
                sourceCurrency: 'USD',
                unitPriceMinor: 1500,
                sourceUnitPriceMinor: 1500,
              },
            ],
            subtotal: 15,
            totalDiscount: 1,
            totalShippingFee: 2,
            total: 16,
            note: undefined,
            promoCoupons: [{ code: 'SAVE10' }],
            originCountries: ['US'],
          },
        ],
        subtotalPrice: 15,
        totalDiscount: 1,
        totalShippingFee: 2,
        totalPrice: 16,
      }),
    } as unknown as jest.Mocked<CouponPricingService>;
    const storefrontMarketContextService = {
      resolveCurrentRequest: jest.fn().mockResolvedValue({
        currency: 'USD',
        marketCode: 'US',
      }),
    } as unknown as jest.Mocked<StorefrontMarketContextService>;
    const orderTotalPolicyService = {
      assertWithinLimit: jest.fn(),
    } as unknown as jest.Mocked<OrderTotalPolicyService>;
    const checkoutStockReservationService = {
      reserveForQuote: jest.fn().mockResolvedValue({
        reservationId: 'reservation-remote-1',
      }),
    } as unknown as jest.Mocked<CheckoutStockReservationPort>;
    const purchaseEligibilityService = {
      evaluate: jest.fn().mockResolvedValue({ eligible: true, failures: [] }),
    } as unknown as jest.Mocked<PurchaseEligibilityService>;
    const jobDispatcher = {
      dispatch: jest.fn(),
    } as unknown as jest.Mocked<JobDispatcher>;

    const service = new CreateCheckoutQuoteService(
      entityManager,
      checkoutQuoteRepository,
      couponPricingService,
      storefrontMarketContextService,
      orderTotalPolicyService,
      checkoutStockReservationService,
      purchaseEligibilityService,
      jobDispatcher,
    );

    const result = await service.createFromCart({
      actor: {
        type: 'guest',
        guestSessionId: 'guest-1',
      },
      cart: {
        id: 'cart-1',
        userId: null,
        guestSessionId: 'guest-1',
        kind: 'active' as never,
        items: [],
      },
      shippingAddress: {
        fullName: 'Jane Doe',
        address1: '123 Main',
        address2: '',
        city: 'HCMC',
        country: 'VN',
        state: 'HCM',
        zip: '700000',
        phone: '0123',
      },
      presentmentCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10'] }],
    });

    expect(result).toEqual(
      expect.objectContaining({
        quoteId: 'quote-1',
        expiresAt: existingQuote.expiresAt,
        items: [
          expect.objectContaining({
            inventoryId: 'inventory-1',
            quantity: 1,
          }),
        ],
      }),
    );
    expect(quoteRepository.create).not.toHaveBeenCalled();
    expect(checkoutStockReservationService.reserveForQuote).not.toHaveBeenCalled();
    expect(jobDispatcher.dispatch).not.toHaveBeenCalled();
    expect(checkoutQuoteRepository.findReusable).toHaveBeenCalledWith(
      expect.objectContaining({
        cartId: 'cart-1',
        reservationCount: 1,
      }),
      { entityManager: transactionalEntityManager },
    );
  });

  it('normalizes string FX timestamps when building the quote fingerprint', async () => {
    const quoteRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input: Record<string, unknown>) => ({
        id: 'quote-2',
        pricedShops: [],
        ...input,
      })),
    };
    const quoteItemRepository = {
      create: jest.fn((input: Record<string, unknown>) => input),
    };
    const reservationRepository = {
      count: jest.fn().mockResolvedValue(0),
    };
    const transactionalEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'CheckoutQuoteEntity':
            return quoteRepository;
          case 'CheckoutQuoteItemEntity':
            return quoteItemRepository;
          case 'CheckoutStockReservationEntity':
            return reservationRepository;
          default:
            return {};
        }
      }),
      persist: jest.fn(),
      flush: jest.fn(),
      getReference: jest.fn((_entity: unknown, id: string) => ({ id })),
    };
    const entityManager = {
      transactional: jest.fn(async (work: (em: EntityManager) => Promise<unknown>) =>
        work(transactionalEntityManager as unknown as EntityManager)),
    } as unknown as EntityManager;
    const couponPricingService = {
      buildPricedCartSummary: jest.fn().mockResolvedValue({
        shops: [
          {
            shopId: 'shop-1',
            shopName: 'Shop 1',
            items: [
              {
                inventoryId: 'inventory-1',
                productId: 'product-1',
                shopId: 'shop-1',
                shopName: 'Shop 1',
                shopSlug: 'shop-1',
                title: 'Product 1',
                quantity: 1,
                currency: 'USD',
                price: 15,
                effectiveUnitPrice: 15,
                sourceCurrency: 'USD',
                unitPriceMinor: 1500,
                sourceUnitPriceMinor: 1500,
                fxEffectiveAt: '2026-06-27T00:00:00.000Z',
                fxSourceTimestamp: '2026-06-27T00:00:00.000Z',
              },
            ],
            subtotal: 15,
            totalDiscount: 0,
            totalShippingFee: 0,
            total: 15,
            note: undefined,
            promoCoupons: [],
            originCountries: ['US'],
          },
        ],
        subtotalPrice: 15,
        totalDiscount: 0,
        totalShippingFee: 0,
        totalPrice: 15,
      }),
    } as unknown as jest.Mocked<CouponPricingService>;
    const storefrontMarketContextService = {
      resolveCurrentRequest: jest.fn().mockResolvedValue({
        currency: 'USD',
        marketCode: 'US',
      }),
    } as unknown as jest.Mocked<StorefrontMarketContextService>;
    const orderTotalPolicyService = {
      assertWithinLimit: jest.fn(),
    } as unknown as jest.Mocked<OrderTotalPolicyService>;
    const checkoutStockReservationService = {
      reserveForQuote: jest.fn().mockResolvedValue({
        reservationId: 'reservation-remote-1',
      }),
    } as unknown as jest.Mocked<CheckoutStockReservationPort>;
    const purchaseEligibilityService = {
      evaluate: jest.fn().mockResolvedValue({ eligible: true, failures: [] }),
    } as unknown as jest.Mocked<PurchaseEligibilityService>;
    const checkoutQuoteRepository = {
      findReusable: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<CheckoutQuoteRepository>;
    const jobDispatcher = {
      dispatch: jest.fn(),
    } as unknown as jest.Mocked<JobDispatcher>;

    const service = new CreateCheckoutQuoteService(
      entityManager,
      checkoutQuoteRepository,
      couponPricingService,
      storefrontMarketContextService,
      orderTotalPolicyService,
      checkoutStockReservationService,
      purchaseEligibilityService,
      jobDispatcher,
    );

    await expect(
      service.createFromCart({
        actor: {
          type: 'guest',
          guestSessionId: 'guest-1',
        },
        cart: {
          id: 'cart-1',
          userId: null,
          guestSessionId: 'guest-1',
          kind: 'active' as never,
          items: [],
        },
        shippingAddress: {
          fullName: 'Jane Doe',
          address1: '123 Main',
          address2: '',
          city: 'HCMC',
          country: 'VN',
          state: 'HCM',
          zip: '700000',
          phone: '0123',
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        quoteId: 'quote-2',
      }),
    );
    expect((quoteRepository.create as jest.Mock).mock.results[0]?.value).toEqual(
      expect.objectContaining({
        reservationId: 'reservation-remote-1',
      }),
    );
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith(
      'order.cleanup-expired-checkout-quote-reservations',
      {
        quoteId: 'quote-2',
        productIds: ['product-1'],
      },
      expect.objectContaining({
        deduplicationKey: 'order-cleanup-expired-checkout-quote-reservations--quote-2',
      }),
    );
  });

  it('rejects quote creation when stale cart data is no longer purchase eligible', async () => {
    const entityManager = {
      transactional: jest.fn(),
    } as unknown as EntityManager;
    const checkoutQuoteRepository = {
      findReusable: jest.fn(),
    } as unknown as jest.Mocked<CheckoutQuoteRepository>;
    const couponPricingService = {
      buildPricedCartSummary: jest.fn().mockResolvedValue({
        subtotalPrice: 10,
        totalShippingFee: 0,
        totalDiscount: 0,
        totalPrice: 10,
        shops: [{
          shopId: 'shop-1',
          shopName: 'Shop 1',
          items: [{
            cartItemId: 'cart-item-1',
            inventoryId: 'inventory-1',
            productId: 'product-1',
            shopId: 'shop-1',
            shopName: 'Shop 1',
            shopSlug: 'shop-1',
            title: 'Stale Mug',
            imageUrl: 'https://example.com/mug.png',
            quantity: 1,
            currency: 'USD',
            price: 10,
            baseUnitPrice: 10,
            effectiveUnitPrice: 10,
            unitPriceMinor: 1000,
          }],
          subtotal: 10,
          totalDiscount: 0,
          totalShippingFee: 0,
          total: 10,
          promoCoupons: [],
          originCountries: ['US'],
        }],
      }),
    } as unknown as jest.Mocked<CouponPricingService>;
    const storefrontMarketContextService = {
      resolveCurrentRequest: jest.fn().mockResolvedValue({ currency: 'USD' }),
    } as unknown as jest.Mocked<StorefrontMarketContextService>;
    const orderTotalPolicyService = {
      assertWithinLimit: jest.fn(),
    } as unknown as jest.Mocked<OrderTotalPolicyService>;
    const checkoutStockReservationService = {
      reserveForQuote: jest.fn(),
    } as unknown as jest.Mocked<CheckoutStockReservationPort>;
    const purchaseEligibilityService = {
      evaluate: jest.fn().mockResolvedValue({
        eligible: false,
        failures: [{
          inventoryId: 'inventory-1',
          quantity: 1,
          title: 'Stale Mug',
          reason: 'product_inactive',
        }],
      }),
    } as unknown as jest.Mocked<PurchaseEligibilityService>;
    const service = new CreateCheckoutQuoteService(
      entityManager,
      checkoutQuoteRepository,
      couponPricingService,
      storefrontMarketContextService,
      orderTotalPolicyService,
      checkoutStockReservationService,
      purchaseEligibilityService,
      { dispatch: jest.fn() } as unknown as JobDispatcher,
    );

    await expect(
      service.createFromCart({
        actor: { type: 'user', userId: 'user-1' },
        cart: {
          id: 'cart-1',
          userId: 'user-1',
          guestSessionId: null,
          kind: 'active' as never,
          items: [],
        },
        shippingAddress: {
          fullName: 'Jane Doe',
          address1: '123 Main',
          city: 'HCMC',
          country: 'VN',
          state: 'HCM',
          zip: '700000',
          phone: '0123',
        },
      }),
    ).rejects.toThrow('reservation is no longer available');

    expect(entityManager.transactional).not.toHaveBeenCalled();
    expect(checkoutStockReservationService.reserveForQuote).not.toHaveBeenCalled();
  });
});
