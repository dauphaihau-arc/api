import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { MoneyDecimal, roundToMinorUnitIncrement } from '~/platform/money/money';
import type { PaymentConfig } from '~/platform/config/payment.config';
import {
  PayoutAccountNotConnectedError,
  PayoutGateway,
  PayoutProviderNotConfiguredError,
  PayoutTransferPermanentError,
  type PayoutProviderBalance,
  type PayoutTransferInput,
  type PayoutTransferResult,
} from '../app/ports/payout-gateway';

/** The balance entries Stripe reports, one per currency held. */
export interface StripeBalanceAmount {
  amount: number;
  currency: string;
}

/** The slice of `stripe.balance.retrieve()` a funding check reads. */
export interface StripeBalanceSnapshot {
  available: StripeBalanceAmount[];
  pending: StripeBalanceAmount[];
}

export interface StripeConnectPayoutClient {
  transfers: {
    create(
      params: Stripe.TransferCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Stripe.Transfer>;
  };
  balance: {
    retrieve(): Promise<StripeBalanceSnapshot>;
  };
}

/**
 * The `stripe_connect` adapter: moves the seller's net from the platform
 * balance straight onto their Express account with a platform-controlled
 * transfer. Stripe then pays the seller's bank on its own schedule, so Arc never
 * schedules a bank payout.
 *
 * The transfer is denominated in the platform balance currency
 * (`transferAmountMinor`/`transferCurrency`), which the claim already converted
 * from the shop currency at the frozen `fxRate`. The ledger keeps the
 * shop-currency amount it discharges: Stripe then converts from the platform
 * currency into the destination account's and reports the applied
 * `exchange_rate` on the transfer, from which the destination amount is derived.
 * Those two values are the authoritative destination evidence, which supersedes
 * the claim-time estimate.
 *
 * The Payout's public id is the idempotency key, so replaying an attempt after a
 * lost response returns the same transfer instead of moving the money twice.
 * A missing Stripe key does not fail startup: the adapter is constructed with no
 * client and every send raises the named not-configured error instead.
 */
@Injectable()
export class StripeConnectPayoutGateway extends PayoutGateway {
  private readonly stripe: StripeConnectPayoutClient | null;

  constructor(
    paymentConfig: Pick<PaymentConfig, 'stripeSecretKey'>,
    stripe: StripeConnectPayoutClient | null = paymentConfig.stripeSecretKey
      ? new Stripe(paymentConfig.stripeSecretKey)
      : null,
  ) {
    super();
    this.stripe = stripe;
  }

  async send(input: PayoutTransferInput): Promise<PayoutTransferResult> {
    const providerAccountId = input.destination.providerAccountId;

    if (!providerAccountId) {
      throw new PayoutAccountNotConnectedError(input.payoutPublicId);
    }

    const stripe = this.requireStripe();

    let transfer: Stripe.Transfer;

    try {
      transfer = await stripe.transfers.create(
        {
          // The transfer is denominated in the platform's own balance currency:
          // the claim already converted the shop-currency amount, and the
          // ledger keeps the shop-currency amount it discharges.
          amount: input.transferAmountMinor,
          currency: input.transferCurrency.toLowerCase(),
          destination: providerAccountId,
          metadata: { payout_public_id: input.payoutPublicId },
        },
        { idempotencyKey: input.payoutPublicId },
      );
    }
    catch (error) {
      // Stripe answers 4xx only for a request it will keep refusing: a retry in
      // minutes would repeat the same refusal, so the caller fails the Payout
      // instead of scheduling one. Network errors and 5xx stay retryable.
      if (isPermanentStripeError(error)) {
        throw new PayoutTransferPermanentError(
          error instanceof Error ? error.message : 'Stripe refused the transfer',
          readStripeErrorCode(error),
        );
      }

      throw error;
    }

    return {
      reference: transfer.id,
      ...deriveConversionEvidence(transfer, input.transferAmountMinor),
    };
  }

  async retrieveBalance(currency: string): Promise<PayoutProviderBalance | null> {
    // The platform balance is Arc's own, not the connected account's: it is the
    // money a transfer leaves from.
    const balance = await this.requireStripe().balance.retrieve();
    const code = currency.toLowerCase();
    const available = balance.available.find(
      (entry) => entry.currency?.toLowerCase() === code,
    );
    const pending = balance.pending.find(
      (entry) => entry.currency?.toLowerCase() === code,
    );

    if (!available && !pending) {
      return null;
    }

    return {
      currency,
      availableMinor: available?.amount ?? 0,
      pendingMinor: pending?.amount ?? 0,
    };
  }

  private requireStripe(): StripeConnectPayoutClient {
    if (!this.stripe) {
      throw new PayoutProviderNotConfiguredError();
    }

    return this.stripe;
  }
}

/**
 * Whether Stripe's error is one it will keep refusing. `StripeInvalidRequestError`
 * is a 4xx about the request itself (bad amount, unsupported currency, a
 * destination Stripe will not pay); retrying it changes nothing. Everything else
 * — network failures, rate limits Stripe still wants retried, 5xx — stays
 * retryable.
 */
function isPermanentStripeError(error: unknown): boolean {
  if (error instanceof PayoutTransferPermanentError) {
    return true;
  }

  const { type, statusCode } = (error ?? {}) as {
    type?: unknown;
    statusCode?: unknown;
  };

  if (type === 'StripeInvalidRequestError') {
    return true;
  }

  // Rate limiting is the one 4xx that succeeds on the next attempt.
  return typeof statusCode === 'number'
    && statusCode >= 400
    && statusCode < 500
    && statusCode !== 429;
}

/** The provider's own error code, when it sent the structured form. */
function readStripeErrorCode(error: unknown): string | undefined {
  const { code } = (error ?? {}) as { code?: unknown };

  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

/**
 * The `exchange_rate` Stripe reports on a converted transfer, as text. The
 * field is outside the SDK's `Transfer` type for this API version, so it is
 * read defensively: a missing or unusable value means "no provider evidence",
 * never a failed transfer that already moved money.
 */
function readProviderExchangeRate(transfer: Stripe.Transfer): string | null {
  const value = (transfer as { exchange_rate?: unknown }).exchange_rate;

  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? String(value) : null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

/**
 * The rate Stripe applied and the destination amount half-up from
 * `amountMinor * exchange_rate`, using the money helpers so no binary float
 * rounding reaches the stored amount. A same-currency transfer reports no rate,
 * so both values are `null` and the claim's own columns stay as they are.
 */
function deriveConversionEvidence(
  transfer: Stripe.Transfer,
  amountMinor: number,
): { providerFxRate: string | null; targetAmountMinor: number | null } {
  const providerFxRate = readProviderExchangeRate(transfer);

  if (providerFxRate === null) {
    return { providerFxRate: null, targetAmountMinor: null };
  }

  try {
    return {
      providerFxRate,
      targetAmountMinor: roundToMinorUnitIncrement(
        new MoneyDecimal(amountMinor).times(providerFxRate),
      ),
    };
  }
  catch {
    // A rate the provider reported but the money helpers cannot parse is still
    // worth keeping; the derived amount is what is unknown.
    return { providerFxRate, targetAmountMinor: null };
  }
}
