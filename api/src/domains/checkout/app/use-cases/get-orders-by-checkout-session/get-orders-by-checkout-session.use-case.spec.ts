import { GetOrdersByCheckoutSessionUseCase } from './get-orders-by-checkout-session.use-case';

function buildUseCase(input: {
  session: Record<string, unknown>
}) {
  const markCheckoutSessionCompleted = jest.fn(async () => undefined);
  const getOrdersByCheckoutSession = jest.fn()
    .mockResolvedValueOnce({ orderShops: [{ id: 'order-1' }] })
    .mockResolvedValueOnce({ orderShops: [{ id: 'order-1', status: 'paid' }] });
  const retrieveCheckoutSession = jest.fn(async () => input.session);

  const useCase = new GetOrdersByCheckoutSessionUseCase(
    {
      getOrdersByCheckoutSession,
      markCheckoutSessionCompleted,
      markCheckoutSessionExpired: jest.fn(),
    } as never,
    { retrieveCheckoutSession } as never,
  );

  return { useCase, markCheckoutSessionCompleted, retrieveCheckoutSession };
}

describe('GetOrdersByCheckoutSessionUseCase', () => {
  it('persists the card summary when this polling path completes the payment', async () => {
    const { useCase, markCheckoutSessionCompleted } = buildUseCase({
      session: {
        id: 'cs_1',
        status: 'complete',
        paymentStatus: 'paid',
        paymentIntentId: 'pi_1',
        cardBrand: 'visa',
        cardLast4: '4242',
        cardFunding: 'credit',
      },
    });

    await useCase.execute('cs_1');

    expect(markCheckoutSessionCompleted).toHaveBeenCalledWith('cs_1', expect.objectContaining({
      paymentIntentId: 'pi_1',
      paymentStatus: 'paid',
      cardBrand: 'visa',
      cardLast4: '4242',
      cardFunding: 'credit',
    }));
  });

  it('leaves an unpaid session alone', async () => {
    const { useCase, markCheckoutSessionCompleted } = buildUseCase({
      session: { id: 'cs_1', status: 'open', paymentStatus: 'unpaid' },
    });

    await useCase.execute('cs_1');

    expect(markCheckoutSessionCompleted).not.toHaveBeenCalled();
  });
});
