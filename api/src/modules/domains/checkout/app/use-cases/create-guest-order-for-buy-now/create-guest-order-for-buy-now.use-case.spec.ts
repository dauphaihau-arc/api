import type { CartRepository } from '~/modules/domains/cart/app/ports/cart.repository';
import { CartKind } from '~/modules/domains/cart/domain/enums/cart-kind.enum';
import type { PaymentConfig } from '~/config/payment.config';
import type { JobDispatcher } from '~/modules/shared/queue/app/ports/job-dispatcher';
import type { LoadCheckoutQuoteService } from '../../../../order/app/load-checkout-quote.service';
import type { OrderCheckoutService } from '../../../../order/app/order-checkout.service';
import type { GuestOrderTrackingTokenService } from '../../../../order/app/guest-order-tracking-token.service';
import { CreateGuestOrderForBuyNowUseCase } from './create-guest-order-for-buy-now.use-case';

describe('CreateGuestOrderForBuyNowUseCase', () => {
  it('creates a guest buy-now order from a persisted quote', async () => {
    const cartRepository: jest.Mocked<CartRepository> = {
      findInventoryCandidateById: jest.fn(),
      findCartByIdForActor: jest.fn().mockResolvedValue({
        id: 'cart-1',
        userId: null,
        guestSessionId: 'guest-1',
        kind: CartKind.BUY_NOW,
        items: [{
          id: 'cart-item-1',
          quantity: 1,
          isSelectOrder: true,
          updatedAt: new Date(),
          inventory: {
            inventoryId: 'inventory-1',
            productId: 'product-1',
            productSlug: 'product-1',
            shopId: 'shop-1',
            shopName: 'Shop 1',
            shopSlug: 'shop-1',
            title: 'Product 1',
            variantType: 'single',
            stock: 10,
            currency: 'USD',
            pricing: {
              amountMinor: 1000,
              currency: 'USD',
            },
            productState: 'published',
          },
        }],
      }),
      findActiveCart: jest.fn(),
      addItemToActiveCart: jest.fn(),
      createBuyNowCart: jest.fn(),
      updateCartItem: jest.fn(),
      deleteCartItem: jest.fn(),
      mergeGuestCartIntoUser: jest.fn(),
    };
    const loadCheckoutQuoteService = {
      loadForGuest: jest.fn().mockResolvedValue({
        id: 'quote-1',
        cartId: 'cart-1',
        checkoutCurrency: 'USD',
        subtotalMinor: 1000,
        shippingMinor: 0,
        discountMinor: 0,
        totalMinor: 1000,
        shippingAddress: {
          fullName: 'Jane Doe',
          address1: '123 Main',
          city: 'HCMC',
          country: 'VN',
          state: 'HCM',
          zip: '700000',
          phone: '0123',
        },
        items: [{
          inventoryId: 'inventory-1',
          productId: 'product-1',
          shopId: 'shop-1',
          shopName: 'Shop 1',
          shopSlug: 'shop-1',
          title: 'Product 1',
          quantity: 1,
          unitPriceMinor: 1000,
          lineTotalMinor: 1000,
          currency: 'USD',
        }],
        shops: [{
          shopId: 'shop-1',
          shopName: 'Shop 1',
          shopSlug: 'shop-1',
          subtotalMinor: 1000,
          discountMinor: 0,
          shippingMinor: 0,
          totalMinor: 1000,
          promoCodes: [],
          originCountries: ['US'],
          items: [{
            inventoryId: 'inventory-1',
            productId: 'product-1',
            shopId: 'shop-1',
            shopName: 'Shop 1',
            shopSlug: 'shop-1',
            title: 'Product 1',
            quantity: 1,
            unitPriceMinor: 1000,
            lineTotalMinor: 1000,
            currency: 'USD',
          }],
        }],
      }),
    } as unknown as jest.Mocked<LoadCheckoutQuoteService>;
    const orderCheckoutService = {
      createOrders: jest.fn().mockResolvedValue({
        orderShops: [{
          id: 'order-1', shopId: 'shop-1', shopName: 'Shop 1', shopSlug: 'shop-1', 
        }],
      }),
    } as unknown as jest.Mocked<OrderCheckoutService>;
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<JobDispatcher>;
    const guestOrderTrackingTokenService = {
      issue: jest.fn().mockReturnValue('token-1'),
    } as unknown as jest.Mocked<GuestOrderTrackingTokenService>;
    const paymentConfig = {
      appBaseUrl: 'https://example.com',
    } as PaymentConfig;

    const useCase = new CreateGuestOrderForBuyNowUseCase(
      cartRepository,
      loadCheckoutQuoteService,
      orderCheckoutService,
      jobDispatcher,
      guestOrderTrackingTokenService,
      paymentConfig,
    );

    await useCase.execute('guest-1', {
      paymentType: 'card' as never,
      quoteId: 'quote-1',
      guest: {
        email: 'guest@example.com',
      },
    });

    expect(loadCheckoutQuoteService.loadForGuest).toHaveBeenCalledWith('guest-1', 'quote-1');
    expect(orderCheckoutService.createOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'guest',
        email: 'guest@example.com',
      }),
      'cart-1',
      expect.any(Object),
      expect.objectContaining({
        quote: expect.objectContaining({
          id: 'quote-1',
        }),
        isTempCart: true,
      }),
    );
  });
});
