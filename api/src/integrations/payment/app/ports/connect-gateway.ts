/**
 * Raising a Connect account request when Stripe is not configured. It is a
 * named error so the HTTP layer can answer 503 instead of crashing startup:
 * local and test deployments run without Stripe keys.
 */
export class ConnectNotConfiguredError extends Error {
  constructor() {
    super('Stripe Connect is not configured');
    this.name = 'ConnectNotConfiguredError';
  }
}

/**
 * The provider does not have the connected account Arc asked for. A webhook
 * can name an account from another environment or a deleted one, which is not
 * a failure to retry: the caller logs and ignores it.
 */
export class ConnectAccountNotFoundError extends Error {
  constructor(readonly accountId: string) {
    super(`Stripe Connect account ${accountId} does not exist`);
    this.name = 'ConnectAccountNotFoundError';
  }
}

/**
 * Stripe refused to create an account in the requested country. Raised by the
 * adapter so the seller hears that the country is unsupported rather than a
 * generic provider failure.
 */
export class ConnectCountryUnsupportedError extends Error {
  constructor(readonly country: string) {
    super(`Stripe Connect does not support onboarding sellers in ${country}`);
    this.name = 'ConnectCountryUnsupportedError';
  }
}

/**
 * Stripe refused the account's capability and service-agreement combination,
 * which is a configuration failure on Arc's side rather than the seller's. The
 * message is deliberately plain: the raw provider message is logged by the
 * adapter, never shown to the seller.
 */
export class ConnectAccountConfigurationError extends Error {
  constructor() {
    super('Stripe Connect cannot onboard sellers with the current configuration');
    this.name = 'ConnectAccountConfigurationError';
  }
}

export interface CreateConnectAccountInput {
  country: string;
  email: string;
}

export interface CreateConnectAccountResult {
  id: string;
}

export interface CreateConnectAccountLinkInput {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
}

export interface CreateConnectAccountLinkResult {
  url: string;
  expiresAt?: Date;
}

/**
 * Display metadata for the account the provider pays into. It deliberately
 * stops at the bank name and last four: the full account number and any
 * routing number never leave Stripe.
 */
export interface ConnectExternalAccount {
  /** The bank's name as Stripe reports it, e.g. `Chase`. */
  bankName: string | null;

  /** The last four digits of the account number. */
  last4: string | null;

  /** ISO 4217 currency this account settles in. */
  currency: string | null;

  /** ISO 3166-1 alpha-2 country where the account is held. */
  country: string | null;

  /** Whether this is the destination Stripe pays in `currency`. */
  defaultForCurrency: boolean;
}

/**
 * One connected account as the provider currently reports it. It is the only
 * shape Arc stores: an id, capability flags and display-only bank metadata,
 * never a bank number or identity document.
 */
export interface ConnectAccountDetails {
  id: string;
  country: string | null;
  defaultCurrency: string | null;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;

  /**
   * The bank account Stripe pays into, or `null` when the account has none yet
   * (unonboarded) or only a card.
   */
  externalAccount: ConnectExternalAccount | null;

  /** Stripe's transfers capability status: `active`, `pending`, `inactive`… */
  transfersCapability: string | null;

  /** The requirements still due, as field names such as `external_account`. */
  requirementsDue: string[];

  /**
   * Why Stripe disabled the account's capabilities, or `null` when nothing is
   * disabled (`requirements.past_due`, `rejected.fraud`, …).
   */
  disabledReason: string | null;
}

/**
 * The Stripe Connect seam: account creation, hosted onboarding links, and the
 * account's current capabilities. It is deliberately separate from
 * `PaymentGateway` so charges and payouts destinations evolve independently.
 */
export interface ConnectGateway {
  createAccount(
    input: CreateConnectAccountInput,
  ): Promise<CreateConnectAccountResult>;

  createAccountLink(
    input: CreateConnectAccountLinkInput,
  ): Promise<CreateConnectAccountLinkResult>;

  retrieveAccount(accountId: string): Promise<ConnectAccountDetails>;
}

export const CONNECT_GATEWAY = Symbol('CONNECT_GATEWAY');
