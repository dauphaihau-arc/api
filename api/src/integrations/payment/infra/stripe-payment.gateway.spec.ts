import type Stripe from 'stripe';
import type { PaymentConfig } from '~/platform/config/payment.config';
import { StripePaymentGateway } from './stripe-payment.gateway';

interface StubStripe {
  webhooks: {
    constructEvent: (payload: Buffer, signature: string, secret: string) => unknown;
  };
  balanceTransactions: {
    retrieve: (reference: string) => Promise<unknown>;
  };
}

function buildGateway() {
  const config: PaymentConfig = {
    stripeSecretKey: 'sk_test_stub',
    stripeWebhookSecretKey: 'whsec_stub',
    appBaseUrl: 'https://shop.example',
    checkoutSessionTtlMs: 60 * 60 * 1000,
  };

  return new StripePaymentGateway(config);
}

function stubStripe(gateway: StripePaymentGateway, stripe: Partial<StubStripe>): void {
  // The Stripe client is private by design; the spec replaces it to exercise
  // the mapping without a network round trip.
  const internals = gateway as unknown as { stripe: StubStripe | null };
  internals.stripe = {
    webhooks: {
      constructEvent: () => {
        throw new Error('constructEvent was not expected');
      },
    },
    balanceTransactions: {
      retrieve: async () => {
        throw new Error('retrieve was not expected');
      },
    },
    ...stripe,
  };
}

function mapObject(type: string, object: unknown): unknown {
  const gateway = buildGateway();
  stubStripe(gateway, {
    webhooks: {
      constructEvent: () => ({
        id: 'evt_test',
        type,
        data: { object },
      }),
    },
  });

  return gateway.constructWebhookEvent(Buffer.from('{}'), 'signature').data.object;
}

describe('StripePaymentGateway webhook mapping', () => {
  it('maps a charge.succeeded charge to its balance transaction reference', () => {
    const mapped = mapObject('charge.succeeded', {
      id: 'ch_123',
      balance_transaction: 'txn_123',
    });

    expect(mapped).toEqual({
      chargeId: 'ch_123',
      balanceTransactionId: 'txn_123',
    });
  });

  it('maps a charge.updated charge to its balance transaction reference', () => {
    const mapped = mapObject('charge.updated', {
      id: 'ch_123',
      balance_transaction: 'txn_updated',
    });

    expect(mapped).toEqual({
      chargeId: 'ch_123',
      balanceTransactionId: 'txn_updated',
    });
  });

  it('reduces an expanded balance transaction to its id', () => {
    const mapped = mapObject('charge.refunded', {
      id: 'ch_123',
      balance_transaction: { id: 'txn_expanded', fee: 30 },
    });

    expect(mapped).toEqual({
      chargeId: 'ch_123',
      balanceTransactionId: 'txn_expanded',
    });
  });

  it('maps a charge without a balance transaction to a null reference', () => {
    const mapped = mapObject('charge.succeeded', {
      id: 'ch_123',
      balance_transaction: null,
    });

    expect(mapped).toEqual({
      chargeId: 'ch_123',
      balanceTransactionId: null,
    });
  });

  it('adds the balance transaction reference to refund details', () => {
    const mapped = mapObject('refund.updated', {
      id: 're_123',
      payment_intent: 'pi_123',
      status: 'succeeded',
      amount: 2500,
      failure_reason: null,
      balance_transaction: 'txn_refund',
    });

    expect(mapped).toEqual({
      id: 're_123',
      paymentIntentId: 'pi_123',
      status: 'succeeded',
      amount: 2500,
      failureReason: null,
      balanceTransactionId: 'txn_refund',
    });
  });

  it('keeps a refund balance transaction nullable', () => {
    const mapped = mapObject('refund.created', {
      id: 're_123',
      payment_intent: { id: 'pi_123' },
      status: 'pending',
      amount: 2500,
      failure_reason: null,
      balance_transaction: null,
    });

    expect(mapped).toEqual({
      id: 're_123',
      paymentIntentId: 'pi_123',
      status: 'pending',
      amount: 2500,
      failureReason: null,
      balanceTransactionId: null,
    });
  });

  it('maps dispute balance transactions, expanded or not', () => {
    const mapped = mapObject('charge.dispute.created', {
      id: 'du_123',
      balance_transactions: [
        { id: 'txn_dispute_1', fee: 1500 },
        'txn_dispute_2',
      ],
    });

    expect(mapped).toEqual({
      disputeId: 'du_123',
      balanceTransactionIds: ['txn_dispute_1', 'txn_dispute_2'],
    });
  });

  it('keeps the checkout session mapping intact', () => {
    const mapped = mapObject('checkout.session.completed', {
      id: 'cs_123',
      status: 'complete',
      payment_status: 'paid',
      payment_intent: 'pi_123',
      expires_at: 1_700_000_000,
    });

    expect(mapped).toEqual({
      id: 'cs_123',
      status: 'complete',
      paymentStatus: 'paid',
      paymentIntentId: 'pi_123',
      expiresAt: new Date(1_700_000_000 * 1000),
    });
  });
});

describe('StripePaymentGateway.retrieveBalanceTransaction', () => {
  it('maps the provider fee, net, currency and timestamps', async () => {
    const gateway = buildGateway();
    const retrieve = jest.fn().mockResolvedValue({
      id: 'txn_123',
      amount: 1189,
      fee: 189,
      net: 1000,
      currency: 'usd',
      created: 1_700_000_000,
      available_on: 1_700_086_400,
    } satisfies Partial<Stripe.BalanceTransaction>);
    stubStripe(gateway, { balanceTransactions: { retrieve } });

    await expect(gateway.retrieveBalanceTransaction('txn_123')).resolves.toEqual({
      id: 'txn_123',
      amountMinor: 1189,
      feeMinor: 189,
      netMinor: 1000,
      currency: 'USD',
      createdAt: new Date(1_700_000_000 * 1000),
      availableAt: new Date(1_700_086_400 * 1000),
    });
    expect(retrieve).toHaveBeenCalledWith('txn_123');
  });

  it('keeps a reversal fee negative and omits an unknown availability', async () => {
    const gateway = buildGateway();
    stubStripe(gateway, {
      balanceTransactions: {
        retrieve: async () => ({
          id: 'txn_reversal',
          amount: -2500,
          fee: -250,
          net: -2250,
          currency: 'eur',
          created: 1_700_000_000,
          available_on: null,
        }),
      },
    });

    await expect(gateway.retrieveBalanceTransaction('txn_reversal')).resolves.toEqual({
      id: 'txn_reversal',
      amountMinor: -2500,
      feeMinor: -250,
      netMinor: -2250,
      currency: 'EUR',
      createdAt: new Date(1_700_000_000 * 1000),
      availableAt: undefined,
    });
  });

  it('propagates a provider read failure so the caller can retry', async () => {
    const gateway = buildGateway();
    stubStripe(gateway, {
      balanceTransactions: {
        retrieve: async () => {
          throw new Error('balance transaction not found');
        },
      },
    });

    await expect(gateway.retrieveBalanceTransaction('txn_missing')).rejects.toThrow(
      'balance transaction not found',
    );
  });
});
