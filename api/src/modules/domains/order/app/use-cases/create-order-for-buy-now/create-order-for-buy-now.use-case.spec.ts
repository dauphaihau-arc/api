import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { CartRepository } from '~/modules/domains/cart/app/ports/cart.repository';
import { CartKind } from '~/modules/domains/cart/domain/enums/cart-kind.enum';
import type { LoadCheckoutQuoteService } from '../../load-checkout-quote.service';
import type { OrderCheckoutService } from '../../order-checkout.service';
import { CreateOrderForBuyNowUseCase } from './create-order-for-buy-now.use-case';

describe('CreateOrderForBuyNowUseCase', () => {
  it('creates a buy-now order from a persisted quote', async () => {
    const actor: AuthenticatedUser = {
      userId: 'user-1',
      email: 'buyer@example.com',
      status: UserStatus.ACTIVE,
      sessionId: 'session-1',
      roles: [],
      permissions: [],
    };

    const cartRepository: jest.Mocked<CartRepository> = {
      findInventoryCandidateById: jest.fn(),
      findCartByIdForActor: jest.fn().mockResolvedValue({
        id: 'cart-1',
        userId: actor.userId,
        guestSessionId: null,
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
      loadForUser: jest.fn().mockResolvedValue({
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
      createOrders: jest.fn().mockResolvedValue({ orderShops: [] }),
    } as unknown as jest.Mocked<OrderCheckoutService>;

    const useCase = new CreateOrderForBuyNowUseCase(
      cartRepository,
      loadCheckoutQuoteService,
      orderCheckoutService
    );

    await useCase.execute(actor, {
      paymentType: 'card' as never,
      quoteId: 'quote-1',
    });

    expect(loadCheckoutQuoteService.loadForUser).toHaveBeenCalledWith(actor.userId, 'quote-1');
    expect(orderCheckoutService.createOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'user',
        userId: actor.userId,
      }),
      'cart-1',
      expect.any(Object),
      expect.objectContaining({
        quote: expect.objectContaining({
          id: 'quote-1',
        }),
        isTempCart: true,
      })
    );
  });
});
