import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import {
  CONNECT_GATEWAY,
  ConnectCountryUnsupportedError,
  ConnectNotConfiguredError,
  type ConnectGateway,
} from '~/integrations/payment/app/ports/connect-gateway';
import {
  PAYOUT_PROVIDER_CONFIG,
  type PayoutProviderConfig,
} from '~/platform/config/payout-provider.config';
import {
  PAYOUT_CONNECT_COUNTRIES_CONFIG,
  isSupportedConnectCountry,
  type PayoutConnectCountriesConfig,
} from '~/platform/config/payout-country.config';
import {
  PayoutAccountCountryUnsupportedError,
  PayoutProviderNotConfiguredError,
  ShopSettlementCurrencyUnresolvedError,
} from '../../errors/finance-app.error';
import {
  PayoutAccountRepository,
  type PayoutAccountRecord,
} from '../../ports/payout-account.repository';
import { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import {
  MANUAL_BANK_PROVIDER,
  STRIPE_CONNECT_PROVIDER,
  assertValidPayoutAccountCountry,
  type PayoutAccountStatus,
} from '../../../domain/rules/payout-account';

export interface StartPayoutOnboardingInput {
  shopId: string;
  shopPublicId: string;
  /** The seller's account email, which Stripe uses for the connected account. */
  email: string;
  country: string;
}

export interface StartPayoutOnboardingResult {
  /**
   * The Stripe-hosted onboarding URL, or `null` for the local adapter, which
   * needs no hosted flow.
   */
  url: string | null;
  status: PayoutAccountStatus;
}

/**
 * Starts or resumes a shop's payout onboarding.
 *
 * The `manual_bank` adapter (local development and tests) creates or keeps an
 * active local row with no provider account and no bank data, so Payouts keep
 * working without Stripe. The `stripe_connect` adapter reuses the shop's
 * existing connected account when it has one — a seller who abandoned
 * onboarding keeps the same `acct_…` — and otherwise creates an Express account
 * with the transfers capability requested, then returns a fresh hosted link.
 */
@Injectable()
export class StartPayoutOnboardingUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly settlementCurrencyRepository: SettlementCurrencyRepository,
    @Inject(PAYOUT_PROVIDER_CONFIG)
    private readonly payoutProviderConfig: PayoutProviderConfig,
    @Inject(PAYOUT_CONNECT_COUNTRIES_CONFIG)
    private readonly payoutConnectCountriesConfig: PayoutConnectCountriesConfig,
    @Inject(CONNECT_GATEWAY)
    private readonly connectGateway: ConnectGateway,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(
    input: StartPayoutOnboardingInput,
  ): Promise<StartPayoutOnboardingResult> {
    const country = input.country.trim().toUpperCase();
    assertValidPayoutAccountCountry(country);

    // The allowlist is Stripe's cross-border payout region, optionally narrowed
    // by configuration. Refusing here makes an unsupported pick a plain 400
    // instead of a provider call Stripe would reject.
    if (
      this.payoutProviderConfig.provider === STRIPE_CONNECT_PROVIDER
      && !isSupportedConnectCountry(this.payoutConnectCountriesConfig, country)
    ) {
      throw new PayoutAccountCountryUnsupportedError(country);
    }

    const settlementCurrency = await this.settlementCurrencyRepository
      .ensureCurrentCurrency(input.shopId);

    if (!settlementCurrency) {
      throw new ShopSettlementCurrencyUnresolvedError(input.shopId);
    }

    const existing = await this.payoutAccountRepository
      .findActiveByShopId(input.shopId);

    const account = this.payoutProviderConfig.provider === STRIPE_CONNECT_PROVIDER
      ? await this.startStripeConnect(input, existing, country, settlementCurrency)
      : await this.startManualBank(input, existing, country, settlementCurrency);

    await this.auditLogService.record({
      action: 'finance.payout_account.onboarding_started',
      entityType: 'payout_account',
      entityId: account.id,
      entityPublicId: input.shopPublicId,
      summary: {
        shopId: input.shopId,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        country: account.country,
        status: account.status,
      },
    });

    return {
      url: account.provider === STRIPE_CONNECT_PROVIDER
        ? await this.createOnboardingLink(account)
        : null,
      status: account.status,
    };
  }

  private async startManualBank(
    input: StartPayoutOnboardingInput,
    existing: PayoutAccountRecord | null,
    country: string,
    settlementCurrency: string,
  ): Promise<PayoutAccountRecord> {
    // The local adapter has no upstream account and no verification step: a
    // seller who asks to be paid is immediately payable, which is what keeps
    // local Payout runs and manual withdrawals working. It has no provider to
    // report a default currency, so the shop's Settlement Currency is the
    // account currency.
    const capabilities = {
      provider: MANUAL_BANK_PROVIDER,
      providerAccountId: null,
      country,
      currency: settlementCurrency,
      status: 'active' as const,
      payoutsEnabled: true,
      chargesEnabled: true,
      transfersCapability: 'active',
      requirements: null,
      defaultCurrency: settlementCurrency,
    };

    return this.persist(input.shopId, existing, capabilities);
  }

  private async startStripeConnect(
    input: StartPayoutOnboardingInput,
    existing: PayoutAccountRecord | null,
    country: string,
    settlementCurrency: string,
  ): Promise<PayoutAccountRecord> {
    let providerAccountId = existing?.provider === STRIPE_CONNECT_PROVIDER
      ? existing.providerAccountId
      : null;

    if (!providerAccountId) {
      const created = await this.callConnect(() =>
        this.connectGateway.createAccount({
          country,
          email: input.email,
        }),
      );
      providerAccountId = created.id;
    }

    // Re-running onboarding for an account Stripe already activated must not
    // downgrade it: the seller may be opening the flow to update details, and
    // the next `account.updated` will confirm the real state.
    const status = existing?.status === 'active' && existing.provider === STRIPE_CONNECT_PROVIDER
      ? 'active'
      : 'onboarding';

    // The account currency is never a seller choice: it is Stripe's
    // `default_currency` for the connected account, applied by the next
    // `account.updated`. Until Stripe has reported one, the row keeps the
    // currency it already had, or the Settlement Currency as a placeholder.
    const currency = existing?.provider === STRIPE_CONNECT_PROVIDER
      ? existing.currency
      : existing?.defaultCurrency ?? settlementCurrency;

    return this.persist(input.shopId, existing, {
      provider: STRIPE_CONNECT_PROVIDER,
      providerAccountId,
      country,
      currency,
      status,
      // A row that used to be the local adapter carries local capability flags;
      // Stripe has not reported anything yet, so they are cleared until the
      // first `account.updated`.
      ...(existing?.provider === STRIPE_CONNECT_PROVIDER
        ? {}
        : {
          payoutsEnabled: false,
          chargesEnabled: false,
          transfersCapability: null,
          requirements: null,
          defaultCurrency: null,
        }),
    });
  }

  private persist(
    shopId: string,
    existing: PayoutAccountRecord | null,
    patch: {
      provider: string;
      providerAccountId: string | null;
      country: string;
      currency: string;
      status: PayoutAccountStatus;
      payoutsEnabled?: boolean;
      chargesEnabled?: boolean;
      transfersCapability?: string | null;
      requirements?: PayoutAccountRecord['requirements'];
      defaultCurrency?: string | null;
    },
  ): Promise<PayoutAccountRecord> {
    if (!existing) {
      return this.entityManager.transactional(
        async (entityManager) => this.payoutAccountRepository.createActive(
          { shopId, ...patch },
          { entityManager },
        ),
      );
    }

    return this.entityManager.transactional(async (entityManager) => {
      const updated = await this.payoutAccountRepository.updateActive(
        { shopId, ...patch },
        { entityManager },
      );

      if (!updated) {
        throw new Error(
          `Payout Account for shop ${shopId} disappeared during onboarding`,
        );
      }

      return updated;
    });
  }

  private async createOnboardingLink(
    account: PayoutAccountRecord,
  ): Promise<string> {
    const link = await this.callConnect(() =>
      this.connectGateway.createAccountLink({
        accountId: account.providerAccountId!,
        returnUrl: this.payoutProviderConfig.connectReturnUrl,
        refreshUrl: this.payoutProviderConfig.connectRefreshUrl,
      }),
    );

    return link.url;
  }

  /**
   * Translates the two provider failures that have a seller-facing answer into
   * Finance errors: an unsupported country and a deployment without Stripe. A
   * genuine provider failure stays as it is and surfaces as a server error.
   */
  private async callConnect<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    }
    catch (error) {
      if (error instanceof ConnectCountryUnsupportedError) {
        throw new PayoutAccountCountryUnsupportedError(error.country);
      }

      if (error instanceof ConnectNotConfiguredError) {
        throw new PayoutProviderNotConfiguredError();
      }

      throw error;
    }
  }
}
