import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import {
  ConnectAccountConfigurationError,
  ConnectAccountNotFoundError,
  ConnectCountryUnsupportedError,
  ConnectNotConfiguredError,
} from '../app/ports/connect-gateway';
import {
  StripeConnectGateway,
  type StripeConnectClient,
} from './stripe-connect.gateway';

class FakeStripeClient implements StripeConnectClient {
  readonly createCalls: Stripe.AccountCreateParams[] = [];

  /** Errors `accounts.create` should reject with, in call order. */
  readonly createErrors: Error[] = [];

  /** Errors `accounts.retrieve` should reject with, in call order. */
  readonly retrieveErrors: Error[] = [];

  readonly accounts = {
    create: async (
      params: Stripe.AccountCreateParams,
    ): Promise<Stripe.Account> => {
      this.createCalls.push(params);

      const error = this.createErrors.shift();

      if (error) {
        throw error;
      }

      return { id: 'acct_test_created', object: 'account' } as Stripe.Account;
    },
    retrieve: async (): Promise<Stripe.Account> => {
      const error = this.retrieveErrors.shift();

      if (error) {
        throw error;
      }

      return { id: 'acct_test_created', object: 'account' } as Stripe.Account;
    },
  };

  readonly accountLinks = {
    create: async (): Promise<Stripe.AccountLink> =>
      ({
        url: 'https://connect.stripe.test/setup',
        expires_at: 1_700_000_000,
      }) as Stripe.AccountLink,
  };
}

const ACCOUNT_INPUT = { country: 'GB', email: 'seller@example.com' };

function gateway(
  stripe: StripeConnectClient | null,
): StripeConnectGateway {
  return new StripeConnectGateway({ stripeSecretKey: 'sk_test_123' }, stripe);
}

/** The error Stripe raises for a transfers-only cross-border account. */
function crossBorderTransfersError(
  country = 'GB',
): Stripe.errors.StripeInvalidRequestError {
  return new Stripe.errors.StripeInvalidRequestError({
    type: 'invalid_request_error',
    message: `When requesting the \`transfers\` capability for accounts in ${country}, you must either specify the \`recipient\` service agreement, or request the \`card_payments\` capability along with \`transfers\`.`,
  });
}

describe('StripeConnectGateway.createAccount', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests transfers only on an Express account by default', async () => {
    const stripe = new FakeStripeClient();

    await expect(gateway(stripe).createAccount(ACCOUNT_INPUT))
      .resolves.toEqual({ id: 'acct_test_created' });

    expect(stripe.createCalls).toEqual([
      {
        type: 'express',
        country: 'GB',
        email: 'seller@example.com',
        capabilities: {
          transfers: { requested: true },
        },
      },
    ]);
  });

  it('retries with card_payments when the country requires it', async () => {
    const stripe = new FakeStripeClient();
    stripe.createErrors.push(crossBorderTransfersError());

    await expect(gateway(stripe).createAccount(ACCOUNT_INPUT))
      .resolves.toEqual({ id: 'acct_test_created' });

    expect(stripe.createCalls).toHaveLength(2);
    expect(stripe.createCalls[1]).toEqual({
      type: 'express',
      country: 'GB',
      email: 'seller@example.com',
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
    });
    expect(stripe.createCalls[1]).not.toHaveProperty('controller');
  });

  it('maps a retry that still fails to the configuration error', async () => {
    const stripe = new FakeStripeClient();
    stripe.createErrors.push(
      crossBorderTransfersError(),
      crossBorderTransfersError(),
    );

    await expect(gateway(stripe).createAccount(ACCOUNT_INPUT))
      .rejects.toBeInstanceOf(ConnectAccountConfigurationError);
    expect(stripe.createCalls).toHaveLength(2);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('card_payments'),
    );
  });

  it('maps an unsupported country to the country error', async () => {
    const stripe = new FakeStripeClient();
    stripe.createErrors.push(
      new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        message: 'Stripe Connect is not supported in ZZ',
        param: 'country',
      }),
    );

    await expect(gateway(stripe).createAccount(ACCOUNT_INPUT))
      .rejects.toBeInstanceOf(ConnectCountryUnsupportedError);
    expect(stripe.createCalls).toHaveLength(1);
  });

  it('maps an unusable service agreement to the configuration error', async () => {
    const stripe = new FakeStripeClient();
    stripe.createErrors.push(
      new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        message:
          'The recipient service agreement is not supported for platforms in US creating accounts in GB.',
        param: 'tos_acceptance[service_agreement]',
      }),
    );

    const error = await gateway(stripe)
      .createAccount(ACCOUNT_INPUT)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ConnectAccountConfigurationError);
    expect((error as Error).message).not.toMatch(
      /service agreement|capability|recipient/i,
    );
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('recipient service agreement'),
    );
  });

  it('maps a platform capability refusal to the configuration error', async () => {
    const stripe = new FakeStripeClient();
    stripe.createErrors.push(
      new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        message: 'The platform cannot request this capability for this account',
        code: 'platform_capability_not_supported',
      }),
    );

    await expect(gateway(stripe).createAccount(ACCOUNT_INPUT))
      .rejects.toBeInstanceOf(ConnectAccountConfigurationError);
  });

  it('rethrows an unrelated Stripe error unchanged', async () => {
    const stripe = new FakeStripeClient();
    const unrelated = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'No such account: acct_missing',
    });
    stripe.createErrors.push(unrelated);

    await expect(gateway(stripe).createAccount(ACCOUNT_INPUT))
      .rejects.toBe(unrelated);
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });

  it('raises the not-configured error without a Stripe key', async () => {
    await expect(gateway(null).createAccount(ACCOUNT_INPUT))
      .rejects.toBeInstanceOf(ConnectNotConfiguredError);
  });
});

describe('StripeConnectGateway.retrieveAccount', () => {
  it('reports a missing account as a not-found error', async () => {
    const stripe = new FakeStripeClient();
    stripe.retrieveErrors.push(
      new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        code: 'resource_missing',
        message: 'No such account: acct_missing',
      }),
    );

    await expect(gateway(stripe).retrieveAccount('acct_missing'))
      .rejects.toBeInstanceOf(ConnectAccountNotFoundError);
  });

  it('rethrows a transient Stripe failure unchanged', async () => {
    const stripe = new FakeStripeClient();
    const transient = new Stripe.errors.StripeConnectionError({
      type: 'api_error',
      message: 'Network error',
    });
    stripe.retrieveErrors.push(transient);

    await expect(gateway(stripe).retrieveAccount('acct_1'))
      .rejects.toBe(transient);
  });

  it('refuses to read without a Stripe key', async () => {
    await expect(gateway(null).retrieveAccount('acct_1'))
      .rejects.toBeInstanceOf(ConnectNotConfiguredError);
  });
});
