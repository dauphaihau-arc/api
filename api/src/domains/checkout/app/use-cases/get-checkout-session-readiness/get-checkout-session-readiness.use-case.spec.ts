import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import { GetCheckoutSessionReadinessUseCase } from './get-checkout-session-readiness.use-case';

const actor = {
  userId: 'user-1',
  email: 'buyer@example.com',
  status: 'active',
  sessionId: 'session-1',
  roles: [],
  permissions: [],
} as never;

function buildUseCase(find: jest.Mock) {
  return new GetCheckoutSessionReadinessUseCase({
    fork: jest.fn(() => ({ find })),
  } as unknown as EntityManager);
}
describe('GetCheckoutSessionReadinessUseCase', () => {
  it('returns checkout pending until the worker stores a checkout session URL', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 'order-1',
        orderNumber: 'ORD-20260604-000001',
        paymentDetails: {},
        shop: {
          id: 'shop-1',
          shopName: 'Shop 1',
          slug: 'shop-1',
        },
      },
    ]);
    const useCase = buildUseCase(find);

    await expect(useCase.execute(actor, ['order-1'])).resolves.toEqual({
      checkoutPending: true,
      checkoutSessionId: undefined,
      checkoutSessionUrl: undefined,
      orderShops: [
        {
          id: 'order-1',
          orderNumber: 'ORD-20260604-000001',
          shopId: 'shop-1',
          shopName: 'Shop 1',
          shopSlug: 'shop-1',
        },
      ],
    });
    expect(find).toHaveBeenCalledWith(
      expect.any(Function),
      {
        id: { $in: ['order-1'] },
        user: 'user-1',
      },
      { populate: ['shop'] },
    );
  });

  it('returns the checkout session URL once it is ready', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 'order-1',
        orderNumber: 'ORD-20260604-000001',
        paymentDetails: {
          checkout_session_id: 'cs_test_1',
          checkout_session_url: 'https://stripe.test/session-1',
        },
        shop: {
          id: 'shop-1',
          shopName: 'Shop 1',
          slug: 'shop-1',
        },
      },
    ]);
    const useCase = buildUseCase(find);

    await expect(useCase.execute(actor, ['order-1'])).resolves.toMatchObject({
      checkoutPending: false,
      checkoutSessionId: 'cs_test_1',
      checkoutSessionUrl: 'https://stripe.test/session-1',
    });
  });

  it('rejects missing or unauthorized order ids', async () => {
    const useCase = buildUseCase(jest.fn().mockResolvedValue([]));

    await expect(useCase.execute(actor, [])).rejects.toBeInstanceOf(BadRequestException);
    await expect(useCase.execute(actor, ['order-1'])).rejects.toBeInstanceOf(NotFoundException);
  });
});
