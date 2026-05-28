import type { CartRepository } from '~/modules/domains/cart/app/ports/cart.repository';
import type { CreateCheckoutQuoteService } from '../../create-checkout-quote.service';
import { CreateGuestCheckoutQuoteFromCartUseCase } from './create-guest-checkout-quote-from-cart.use-case';

describe('CreateGuestCheckoutQuoteFromCartUseCase', () => {
  it('creates a quote from the active guest cart', async () => {
    const cartRepository: jest.Mocked<CartRepository> = {
      findInventoryCandidateById: jest.fn(),
      findCartByIdForActor: jest.fn(),
      findActiveCart: jest.fn().mockResolvedValue({
        id: 'cart-1',
        userId: null,
        guestSessionId: 'guest-1',
        kind: 'active' as never,
        items: [],
      }),
      addItemToActiveCart: jest.fn(),
      createBuyNowCart: jest.fn(),
      updateCartItem: jest.fn(),
      deleteCartItem: jest.fn(),
      mergeGuestCartIntoUser: jest.fn(),
    };
    const createCheckoutQuoteService = {
      createFromCart: jest.fn().mockResolvedValue({
        quoteId: 'quote-1',
      }),
    } as unknown as jest.Mocked<CreateCheckoutQuoteService>;
    const requestContextService = {
      get: jest.fn().mockReturnValue({ currency: 'VND' }),
    };

    const useCase = new CreateGuestCheckoutQuoteFromCartUseCase(
      cartRepository,
      requestContextService as never,
      createCheckoutQuoteService
    );

    await useCase.execute('guest-1', {
      presentmentCurrency: 'USD',
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
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10'] }],
    });

    expect(createCheckoutQuoteService.createFromCart).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          type: 'guest',
          guestSessionId: 'guest-1',
        },
        presentmentCurrency: 'USD',
      })
    );
  });
});
