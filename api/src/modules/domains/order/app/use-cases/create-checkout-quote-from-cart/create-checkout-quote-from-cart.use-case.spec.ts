import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '~/modules/domains/auth/domain/enums/user-status.enum';
import type { CartRepository } from '~/modules/domains/cart/app/ports/cart.repository';
import type { GetMyAddressUseCase } from '~/modules/domains/user/app/use-cases/get-my-address/get-my-address.use-case';
import type { CreateCheckoutQuoteService } from '../../create-checkout-quote.service';
import { CreateCheckoutQuoteFromCartUseCase } from './create-checkout-quote-from-cart.use-case';

describe('CreateCheckoutQuoteFromCartUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'user-1',
    email: 'buyer@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  it('creates a quote from the active user cart and address', async () => {
    const cartRepository: jest.Mocked<CartRepository> = {
      findInventoryCandidateById: jest.fn(),
      findCartByIdForActor: jest.fn(),
      findActiveCart: jest.fn().mockResolvedValue({
        id: 'cart-1',
        userId: actor.userId,
        guestSessionId: null,
        kind: 'active' as never,
        items: [],
      }),
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

    const useCase = new CreateCheckoutQuoteFromCartUseCase(
      cartRepository,
      getMyAddressUseCase,
      createCheckoutQuoteService,
    );

    await useCase.execute(actor, {
      userAddressId: 'addr-1',
      presentmentCurrency: 'USD',
      shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10'] }],
    });

    expect(createCheckoutQuoteService.createFromCart).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          type: 'user',
          userId: actor.userId,
        },
        presentmentCurrency: 'USD',
        shopAdjustments: [{ shopId: 'shop-1', promoCodes: ['SAVE10'] }],
      }),
    );
  });
});
