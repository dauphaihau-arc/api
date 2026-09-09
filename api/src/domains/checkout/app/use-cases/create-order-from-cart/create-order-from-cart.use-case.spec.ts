import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { CartRepository } from '~/domains/cart/app/ports/cart.repository';
import { CartKind } from '~/domains/cart/domain/enums/cart-kind.enum';
import type { LoadCheckoutQuoteService } from '../../../../order/app/services/load-checkout-quote.service';
import type { OrderCheckoutService } from '../../../../order/app/services/order-checkout.service';
import { CreateOrderFromCartUseCase } from './create-order-from-cart.use-case';

describe('CreateOrderFromCartUseCase', () => {
  it('creates an order from the persisted quote context', async () => {
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
        kind: CartKind.ACTIVE,
        items: [{
          id: 'cart-item-1',
          quantity: 2,
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
            stock: 10,
            currency: 'USD',
            pricing: {
              amountMinor: 900,
              originalAmountMinor: 1000,
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
          quantity: 2,
          unitPriceMinor: 900,
          lineTotalMinor: 1800,
          currency: 'USD',
        }],
        shops: [{
          shopId: 'shop-1',
          shopName: 'Shop 1',
          shopSlug: 'shop-1',
          subtotalMinor: 1800,
          discountMinor: 0,
          shippingMinor: 0,
          totalMinor: 1800,
          promoCodes: ['SAVE10'],
          originCountries: ['US'],
          items: [{
            inventoryId: 'inventory-1',
            productId: 'product-1',
            shopId: 'shop-1',
            shopName: 'Shop 1',
            shopSlug: 'shop-1',
            title: 'Product 1',
            quantity: 2,
            unitPriceMinor: 900,
            lineTotalMinor: 1800,
            currency: 'USD',
          }],
        }],
        shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10'] }],
      }),
    } as unknown as jest.Mocked<LoadCheckoutQuoteService>;
    const orderCheckoutService = {
      createOrders: jest.fn().mockResolvedValue({ orderShops: [] }),
    } as unknown as jest.Mocked<OrderCheckoutService>;

    const useCase = new CreateOrderFromCartUseCase(
      cartRepository,
      loadCheckoutQuoteService,
      orderCheckoutService,
    );

    await useCase.execute(actor, {
      paymentType: 'card' as never,
      quoteId: 'quote-1',
    });

    expect(loadCheckoutQuoteService.loadForUser).toHaveBeenCalledWith(actor.userId, 'quote-1');
    expect(orderCheckoutService.createOrders).toHaveBeenCalledWith(
      {
        type: 'user',
        userId: actor.userId,
        email: actor.email,
      },
      'cart-1',
      expect.any(Object),
      expect.objectContaining({
        quote: expect.objectContaining({
          checkoutCurrency: 'USD',
        }),
        shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10'] }],
      }),
    );
  });
});
