import type Stripe from 'stripe';
import {
  PayoutAccountNotConnectedError,
  PayoutProviderNotConfiguredError,
  PayoutTransferPermanentError,
  type PayoutTransferInput,
} from '../app/ports/payout-gateway';
import {
  StripeConnectPayoutGateway,
  type StripeBalanceSnapshot,
  type StripeConnectPayoutClient,
} from './stripe-connect-payout.gateway';

const PAYOUT_PUBLIC_ID = 'pay_01HCONNECT';
const CONNECTED_ACCOUNT_ID = 'acct_1PayoutDestination';

interface RecordedTransfer {
  params: Stripe.TransferCreateParams;
  options?: Stripe.RequestOptions;
}

class FakeStripeClient implements StripeConnectPayoutClient {
  readonly calls: RecordedTransfer[] = [];

  /** The `exchange_rate` Stripe would report on the transfer it returns. */
  exchangeRate: string | number | null = null;

  /** What `balance.retrieve()` answers with. */
  balanceSnapshot: StripeBalanceSnapshot = { available: [], pending: [] };

  /** Thrown from `transfers.create` when set, as the provider would. */
  transferError: unknown = null;

  readonly transfers = {
    create: async (
      params: Stripe.TransferCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Stripe.Transfer> => {
      this.calls.push({ params, options });

      if (this.transferError) {
        throw this.transferError;
      }

      return {
        id: `tr_test_${this.nextTransfer++}`,
        object: 'transfer',
        exchange_rate: this.exchangeRate,
      } as unknown as Stripe.Transfer;
    },
  };

  readonly balance = {
    retrieve: async (): Promise<StripeBalanceSnapshot> => this.balanceSnapshot,
  };

  private nextTransfer = 1;
}

function transferInput(
  overrides: Partial<PayoutTransferInput> = {},
): PayoutTransferInput {
  return {
    payoutPublicId: PAYOUT_PUBLIC_ID,
    provider: 'stripe_connect',
    amountMinor: 12_500,
    currency: 'GBP',
    transferCurrency: 'USD',
    transferAmountMinor: 16_000,
    targetCurrency: 'VND',
    targetAmountMinor: 3_062_500,
    fxRate: '1.28',
    destination: {
      providerAccountId: CONNECTED_ACCOUNT_ID,
      country: 'US',
    },
    ...overrides,
  };
}

function configuredGateway(client: FakeStripeClient): StripeConnectPayoutGateway {
  return new StripeConnectPayoutGateway({ stripeSecretKey: 'sk_test_123' }, client);
}

describe('StripeConnectPayoutGateway', () => {
  it('transfers the converted platform-currency amount to the connected account', async () => {
    const stripe = new FakeStripeClient();

    await expect(configuredGateway(stripe).send(transferInput())).resolves.toEqual({
      reference: 'tr_test_1',
      providerFxRate: null,
      targetAmountMinor: null,
    });

    expect(stripe.calls).toHaveLength(1);
    expect(stripe.calls[0]!.params).toEqual({
      // The shop-currency amount is not what Stripe moves: the claim converted
      // it, and the transfer is denominated in the platform balance currency.
      amount: 16_000,
      currency: 'usd',
      destination: CONNECTED_ACCOUNT_ID,
      metadata: { payout_public_id: PAYOUT_PUBLIC_ID },
    });
    expect(stripe.calls[0]!.options).toEqual({
      idempotencyKey: PAYOUT_PUBLIC_ID,
    });
  });

  it('returns the provider transfer id as the Payout reference', async () => {
    const result = await configuredGateway(new FakeStripeClient()).send(
      transferInput(),
    );

    expect(result.reference).toBe('tr_test_1');
  });

  it('reads the applied rate and derives the destination amount half-up', async () => {
    const stripe = new FakeStripeClient();
    stripe.exchangeRate = '25000.555';

    const result = await configuredGateway(stripe).send(
      transferInput({ amountMinor: 12_500, transferAmountMinor: 1_234 }),
    );

    // 1,234 * 25,000.555 = 30,850,684.87, rounded half-up to a whole minor unit.
    expect(result).toEqual({
      reference: 'tr_test_1',
      providerFxRate: '25000.555',
      targetAmountMinor: 30_850_685,
    });
  });

  it('accepts a numeric exchange rate and stores it as text', async () => {
    const stripe = new FakeStripeClient();
    stripe.exchangeRate = 1.234;

    const result = await configuredGateway(stripe).send(
      transferInput({ amountMinor: 1_000, transferAmountMinor: 1_000 }),
    );

    expect(result).toEqual({
      reference: 'tr_test_1',
      providerFxRate: '1.234',
      targetAmountMinor: 1_234,
    });
  });

  it('reports no evidence for a same-currency transfer', async () => {
    const stripe = new FakeStripeClient();

    const result = await configuredGateway(stripe).send(
      transferInput({ targetCurrency: 'USD' }),
    );

    expect(result).toEqual({
      reference: 'tr_test_1',
      providerFxRate: null,
      targetAmountMinor: null,
    });
  });

  it('leaves the claim-time target amount and rate out of the transfer', async () => {
    const stripe = new FakeStripeClient();

    await configuredGateway(stripe).send(transferInput());

    expect(stripe.calls[0]!.params).not.toHaveProperty('target_amount_minor');
    expect(stripe.calls[0]!.params).not.toHaveProperty('fx_rate');
    expect(stripe.calls[0]!.params.amount).toBe(16_000);
  });

  it('reuses the Payout public id as the idempotency key on a retry', async () => {
    const stripe = new FakeStripeClient();
    const gateway = configuredGateway(stripe);

    await gateway.send(transferInput());
    await gateway.send(transferInput());

    expect(stripe.calls).toHaveLength(2);
    expect(stripe.calls.map((call) => call.options?.idempotencyKey)).toEqual([
      PAYOUT_PUBLIC_ID,
      PAYOUT_PUBLIC_ID,
    ]);
  });

  it('raises the named error for an unconnected account before calling Stripe', async () => {
    const stripe = new FakeStripeClient();

    const send = configuredGateway(stripe).send(
      transferInput({
        destination: { providerAccountId: null, country: 'US' },
      }),
    );

    await expect(send).rejects.toBeInstanceOf(PayoutAccountNotConnectedError);
    await expect(send).rejects.toThrow(PAYOUT_PUBLIC_ID);
    expect(stripe.calls).toHaveLength(0);
  });

  it('raises the named not-configured error when Stripe has no secret key', async () => {
    const gateway = new StripeConnectPayoutGateway({});

    await expect(gateway.send(transferInput())).rejects.toBeInstanceOf(
      PayoutProviderNotConfiguredError,
    );
  });

  it('uses an injected client even without a configured key', async () => {
    const stripe = new FakeStripeClient();

    await expect(
      new StripeConnectPayoutGateway({}, stripe).send(transferInput()),
    ).resolves.toEqual({
      reference: 'tr_test_1',
      providerFxRate: null,
      targetAmountMinor: null,
    });
  });

  it('wraps a refused 4xx transfer as a permanent provider error', async () => {
    const stripe = new FakeStripeClient();
    stripe.transferError = Object.assign(
      new Error('Your balance is insufficient to cover the requested transfer.'),
      { type: 'StripeInvalidRequestError', statusCode: 400, code: 'balance_insufficient' },
    );

    const send = configuredGateway(stripe).send(transferInput());

    await expect(send).rejects.toBeInstanceOf(PayoutTransferPermanentError);
    await expect(send).rejects.toMatchObject({
      message: 'Your balance is insufficient to cover the requested transfer.',
      providerCode: 'balance_insufficient',
    });
  });

  it('leaves a rate-limited 429 transfer failure retryable', async () => {
    const stripe = new FakeStripeClient();
    const failure = Object.assign(new Error('Too many requests'), {
      type: 'StripeRateLimitError',
      statusCode: 429,
    });
    stripe.transferError = failure;

    await expect(
      configuredGateway(stripe).send(transferInput()),
    ).rejects.toBe(failure);
  });

  it('leaves a 5xx transfer failure retryable', async () => {
    const stripe = new FakeStripeClient();
    const failure = Object.assign(new Error('Stripe is down'), {
      type: 'StripeAPIError',
      statusCode: 500,
    });
    stripe.transferError = failure;

    await expect(
      configuredGateway(stripe).send(transferInput()),
    ).rejects.toBe(failure);
  });

  it('reads the available and pending balance in the requested currency', async () => {
    const stripe = new FakeStripeClient();
    stripe.balanceSnapshot = {
      available: [{ amount: 5_000, currency: 'usd' }],
      pending: [{ amount: 1_250, currency: 'usd' }],
    };

    await expect(configuredGateway(stripe).retrieveBalance('USD')).resolves.toEqual({
      currency: 'USD',
      availableMinor: 5_000,
      pendingMinor: 1_250,
    });
  });

  it('reports null when the platform holds no balance in the currency', async () => {
    const stripe = new FakeStripeClient();
    stripe.balanceSnapshot = {
      available: [{ amount: 5_000, currency: 'usd' }],
      pending: [],
    };

    await expect(configuredGateway(stripe).retrieveBalance('CAD')).resolves.toBeNull();
  });
});
