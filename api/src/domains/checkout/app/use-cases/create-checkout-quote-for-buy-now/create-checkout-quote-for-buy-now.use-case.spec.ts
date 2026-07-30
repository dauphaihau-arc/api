import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { UserStatus } from '~/domains/auth/domain/enums/user-status.enum';
import type { CartRepository } from '~/domains/cart/app/ports/cart.repository';
import { CartKind } from '~/domains/cart/domain/enums/cart-kind.enum';
import type { GetMyAddressUseCase } from '~/domains/user/app/use-cases/get-my-address/get-my-address.use-case';
import type { CreateCheckoutQuoteService } from '../../create-checkout-quote.service';
import { CreateCheckoutQuoteForBuyNowUseCase } from './create-checkout-quote-for-buy-now.use-case';

describe('CreateCheckoutQuoteForBuyNowUseCase', () => {
  it('creates a quote from a buy-now cart and saved address', async () => {
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
    const getMyAddressUseCase = {
      execute: jest.fn().mockResolvedValue({
        fullName: 'Jane Doe',
        address1: '123 Main',
        address2: '',
        city: 'HCMC',
        country: 'VN',
        state: 'HCM',
        zip: '700000',
        phone: '0123',
      }),
    } as unknown as jest.Mocked<GetMyAddressUseCase>;
    const createCheckoutQuoteService = {
      createFromCart: jest.fn().mockResolvedValue({
        quoteId: 'quote-1',
      }),
    } as unknown as jest.Mocked<CreateCheckoutQuoteService>;

    const useCase = new CreateCheckoutQuoteForBuyNowUseCase(
      cartRepository,
      getMyAddressUseCase,
      createCheckoutQuoteService,
    );

    await useCase.execute(actor, {
      cartId: 'cart-1',
      userAddressId: 'addr-1',
      presentmentCurrency: 'USD',
      promoCodes: ['SAVE10'],
      note: 'fast',
    });

    expect(createCheckoutQuoteService.createFromCart).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: 'user', userId: actor.userId },
        presentmentCurrency: 'USD',
        shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10'], note: 'fast' }],
      }),
    );
  });
});
