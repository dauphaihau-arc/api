/**
 * The destination a Payout is sent to, as the provider needs it. A connected
 * account is identified only by the provider's account id; there is no bank
 * reference to decrypt or carry across this boundary.
 */
export interface PayoutDestinationInput {
  /** The provider's connected-account id, null for the local adapter. */
  providerAccountId: string | null;
  country: string;
}

export interface PayoutTransferInput {
  /** Arc's own identity for the transfer, and the idempotency key for the provider. */
  payoutPublicId: string;

  /** The adapter token the Payout Account was recorded against. */
  provider: string;

  /** The shop-currency amount being paid out; what the ledger discharges. */
  amountMinor: number;

  /** The shop's Settlement Currency, and the currency of `amountMinor`. */
  currency: string;

  /**
   * The currency the platform's provider balance settles in, and the currency
   * the transfer itself is denominated in. The claim converts `amountMinor`
   * into `transferAmountMinor` at `fxRate` before the provider is called.
   */
  transferCurrency: string;

  /** `amountMinor` converted into `transferCurrency`; what the provider sends. */
  transferAmountMinor: number;

  /** The Payout Account's currency, which may differ from `transferCurrency`. */
  targetCurrency: string;

  /** The conversion rate the claim applied, `'1'` for an identity conversion. */
  fxRate: string;

  /**
   * The Payout Account's currency in which the provider reports what actually
   * landed. Informational only: the adapter must not send it, and the provider's
   * `PayoutTransferResult` is what is authoritative.
   */
  targetAmountMinor: number | null;

  destination: PayoutDestinationInput;
}

export interface PayoutTransferResult {
  /** The provider's own reference for the transfer. */
  reference: string;

  /**
   * The conversion rate the provider applied to this transfer, as text so it is
   * stored exactly as reported, or `null` when the transfer needed no
   * conversion or the adapter has no provider to ask.
   */
  providerFxRate?: string | null;

  /**
   * The amount the provider actually credited in the destination currency, in
   * minor units, or `null` when it reports none. This is authoritative: the
   * claim-time estimate is superseded by it.
   */
  targetAmountMinor?: number | null;
}

/**
 * What the platform holds at the provider in one currency. The provider's
 * balance is the money a transfer can actually come from, so a Payout is
 * checked against it before any claim is written.
 */
export interface PayoutProviderBalance {
  /** The ISO 4217 code this snapshot is for, as requested. */
  currency: string;

  /** Funds available to send now, in minor units. */
  availableMinor: number;

  /** Funds the provider is still settling, in minor units. */
  pendingMinor: number;
}

/**
 * The provider refused the transfer permanently: a malformed request, an
 * account state the provider will not change on its own, or another 4xx. Trying
 * the same transfer again in minutes cannot help, so the Payout is failed rather
 * than retried.
 */
export class PayoutTransferPermanentError extends Error {
  constructor(message: string, readonly providerCode?: string) {
    super(message);
    this.name = 'PayoutTransferPermanentError';
  }
}

/**
 * The Payout Account the transfer was claimed against has no connected-account
 * id, so the provider has nowhere to send the money. Raised before the provider
 * is called: nothing has moved, and the caller can answer 409 rather than
 * recording a provider failure.
 */
export class PayoutAccountNotConnectedError extends Error {
  constructor(readonly payoutPublicId: string) {
    super(
      `Payout ${payoutPublicId} cannot be transferred: its Payout Account is not connected`,
    );
    this.name = 'PayoutAccountNotConnectedError';
  }
}

/**
 * The payout provider needs Stripe and it is not configured. Raised when a
 * transfer is attempted, so the API starts fine without keys and only the
 * payout path answers 503.
 */
export class PayoutProviderNotConfiguredError extends Error {
  constructor(message = 'Stripe Connect is not configured') {
    super(message);
    this.name = 'PayoutProviderNotConfiguredError';
  }
}

/**
 * The payout adapter: the one seam between Finance's decision to pay and the
 * provider that moves the money. A provider implementation sits beside the
 * payment gateway, so per-shop provider accounts can be adopted later without
 * changing what the ledger records.
 *
 * A refused transfer is raised as an error; the caller decides what a failure
 * means for the Payout.
 */
export abstract class PayoutGateway {
  abstract send(input: PayoutTransferInput): Promise<PayoutTransferResult>;

  /**
   * What the platform holds at the provider in `currency`, or `null` when the
   * provider holds no balance in it at all.
   *
   * Read before a Payout is claimed: a transfer in a currency the platform does
   * not hold is refused before anything is written, and one the provider is
   * still settling is refused or skipped rather than retried in minutes. A
   * local adapter that moves no money through a provider reports enough
   * available funds for any Payout.
   */
  abstract retrieveBalance(currency: string): Promise<PayoutProviderBalance | null>;
}
