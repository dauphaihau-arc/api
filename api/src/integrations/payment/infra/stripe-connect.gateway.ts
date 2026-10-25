import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import type { PaymentConfig } from '~/platform/config/payment.config';
import type {
  ConnectAccountDetails,
  ConnectGateway,
  CreateConnectAccountInput,
  CreateConnectAccountLinkInput,
  CreateConnectAccountLinkResult,
  CreateConnectAccountResult,
} from '../app/ports/connect-gateway';
import {
  ConnectAccountConfigurationError,
  ConnectAccountNotFoundError,
  ConnectCountryUnsupportedError,
  ConnectNotConfiguredError,
} from '../app/ports/connect-gateway';
import { toConnectAccountDetails } from './stripe-connect-account.mapper';

/**
 * The slice of the Stripe client Connect onboarding needs. Kept narrow so a
 * test can supply a fake without standing up the whole SDK.
 */
export interface StripeConnectClient {
  accounts: {
    create(params: Stripe.AccountCreateParams): Promise<Stripe.Account>;
    retrieve(
      accountId: string,
      params?: Stripe.AccountRetrieveParams,
    ): Promise<Stripe.Account>;
  };
  accountLinks: {
    create(
      params: Stripe.AccountLinkCreateParams,
    ): Promise<Stripe.AccountLink>;
  };
}

/**
 * The Stripe Express implementation of the Connect port.
 *
 * Arc creates the account with the transfers capability requested, hands the
 * seller a Stripe-hosted onboarding link, and reads back only the capability
 * flags and requirement names. Stripe collects the bank account, identity and
 * tax details itself, so none of it reaches Arc.
 *
 * A platform-country Express account receives transfers without processing
 * payments. Cross-border accounts have no such option: Stripe does not allow
 * the `recipient` service agreement for cross-border payouts, and `type` and
 * `controller` properties are mutually exclusive. Stripe's only supported
 * route there is the full service agreement, so when it answers that
 * `card_payments` must accompany `transfers`, the account is retried with
 * both. Arc still charges on the platform and only transfers the seller's net;
 * the capability being active does not change the funds flow.
 */
@Injectable()
export class StripeConnectGateway implements ConnectGateway {
  private readonly logger = new Logger(StripeConnectGateway.name);
  private readonly stripe: StripeConnectClient | null;

  constructor(
    paymentConfig: Pick<PaymentConfig, 'stripeSecretKey'>,
    stripe: StripeConnectClient | null = paymentConfig.stripeSecretKey
      ? new Stripe(paymentConfig.stripeSecretKey)
      : null,
  ) {
    this.stripe = stripe;
  }

  async createAccount(
    input: CreateConnectAccountInput,
  ): Promise<CreateConnectAccountResult> {
    const stripe = this.requireStripe();
    let requestCardPayments = false;

    // The second pass only runs for cross-border accounts, and only after
    // Stripe itself explains that transfers requires card_payments there.
    for (;;) {
      try {
        const account = await stripe.accounts.create({
          type: 'express',
          country: input.country,
          email: input.email,
          capabilities: {
            transfers: { requested: true },
            ...(requestCardPayments
              ? { card_payments: { requested: true } }
              : {}),
          },
        });

        return { id: account.id };
      }
      catch (error) {
        if (
          error instanceof Stripe.errors.StripeInvalidRequestError
          && (
            error.param === 'country'
            || error.code?.toLowerCase().includes('country')
            || error.message.toLowerCase().includes('country')
          )
        ) {
          throw new ConnectCountryUnsupportedError(input.country);
        }

        if (
          !requestCardPayments
          && requiresCardPaymentsCapability(error)
        ) {
          requestCardPayments = true;
          continue;
        }

        if (isCapabilityConfigurationError(error)) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Stripe refused the Connect account configuration for ${input.country}: ${message}`,
          );

          throw new ConnectAccountConfigurationError();
        }

        throw error;
      }
    }
  }

  async createAccountLink(
    input: CreateConnectAccountLinkInput,
  ): Promise<CreateConnectAccountLinkResult> {
    const link = await this.requireStripe().accountLinks.create({
      account: input.accountId,
      type: 'account_onboarding',
      return_url: input.returnUrl,
      refresh_url: input.refreshUrl,
    });

    return {
      url: link.url,
      expiresAt: link.expires_at
        ? new Date(link.expires_at * 1000)
        : undefined,
    };
  }

  async retrieveAccount(accountId: string): Promise<ConnectAccountDetails> {
    try {
      const account = await this.requireStripe().accounts.retrieve(accountId, {
        expand: ['external_accounts'],
      });

      return toConnectAccountDetails(account);
    }
    catch (error) {
      // A webhook can name an account from another environment or one that no
      // longer exists; that is a final answer, not a transient failure.
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError
        && error.code === 'resource_missing'
      ) {
        throw new ConnectAccountNotFoundError(accountId);
      }

      throw error;
    }
  }

  private requireStripe(): StripeConnectClient {
    if (!this.stripe) {
      throw new ConnectNotConfiguredError();
    }

    return this.stripe;
  }
}

/**
 * Whether Stripe refused a transfers-only account because the country needs
 * `card_payments` alongside it. The message is the only signal: Stripe does
 * not set an error code for this requirement.
 */
function requiresCardPaymentsCapability(error: unknown): boolean {
  if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return message.includes('transfers')
    && message.includes('card_payments')
    && (message.includes('service agreement') || message.includes('must'));
}

/**
 * Whether Stripe rejected the account because its capabilities and service
 * agreement do not satisfy the country's Connect requirements, or because the
 * platform itself cannot onboard into that country at all.
 */
function isCapabilityConfigurationError(error: unknown): boolean {
  if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) {
    return false;
  }

  if (error.code === 'platform_capability_not_supported') {
    return true;
  }

  const message = error.message.toLowerCase();

  return message.includes('service agreement')
    || message.includes('tos agreement')
    || (message.includes('capability') && message.includes('must'));
}

/**
 * The gateway a deployment without Stripe keys gets. Every call raises the named
 * not-configured error, which is answerable as 503, instead of failing startup.
 */
export class NotConfiguredConnectGateway implements ConnectGateway {
  async createAccount(
    _input: CreateConnectAccountInput,
  ): Promise<CreateConnectAccountResult> {
    throw new ConnectNotConfiguredError();
  }

  async createAccountLink(
    _input: CreateConnectAccountLinkInput,
  ): Promise<CreateConnectAccountLinkResult> {
    throw new ConnectNotConfiguredError();
  }

  async retrieveAccount(_accountId: string): Promise<ConnectAccountDetails> {
    throw new ConnectNotConfiguredError();
  }
}
