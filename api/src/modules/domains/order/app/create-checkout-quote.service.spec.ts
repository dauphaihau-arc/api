import type { EntityManager } from '@mikro-orm/postgresql';
import { OrderTotalLimitExceededError } from './errors/order-app.error';
import { CreateCheckoutQuoteService } from './create-checkout-quote.service';
import type { CouponPricingService } from '../../coupon/app/coupon-pricing.service';
import type { StorefrontMarketContextService } from '../../product/app/services/storefront-market-context.service';
import type { OrderTotalPolicyService } from './order-total-policy.service';

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
    } as unknown as EntityManager;
    const couponPricingService = {
      priceCart: jest.fn().mockResolvedValue({
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

    const service = new CreateCheckoutQuoteService(
      entityManager,
      couponPricingService,
      storefrontMarketContextService,
      orderTotalPolicyService
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
      })
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
});
