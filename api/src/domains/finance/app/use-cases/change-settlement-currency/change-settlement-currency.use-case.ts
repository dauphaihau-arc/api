import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import { FxRateService } from '~/integrations/currency/fx-rate.service';
import { Clock } from '~/platform/time/clock';
import {
  MARKETPLACE_CURRENCIES,
  type MarketplaceCurrency,
} from '~/platform/config/marketplace.config';
import {
  SETTLEMENT_CURRENCY_CONFIG,
  type SettlementCurrencyConfig,
} from '~/platform/config/settlement-currency.config';
import {
  SettlementCurrencyBalanceNotZeroError,
  SettlementCurrencyChangePayoutPendingError,
  SettlementCurrencyChangeTooSoonError,
  SettlementCurrencyRateUnavailableError,
  SettlementCurrencyUnchangedError,
  SettlementCurrencyUnsupportedError,
  ShopSettlementCurrencyUnresolvedError,
} from '../../errors/finance-app.error';
import { PayoutAccountRepository } from '../../ports/payout-account.repository';
import { PayoutQueryRepository } from '../../ports/payout-query.repository';
import { PayoutSettingsRepository } from '../../ports/payout-settings.repository';
import { SellerPayableQueryRepository } from '../../ports/seller-payable-query.repository';
import { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import {
  evaluateSettlementCurrencyChange,
  nextSettlementCurrencyChangeAt,
  normalizeCutoverRate,
} from '../../../domain/rules/settlement-currency';

export interface ChangeSettlementCurrencyInput {
  shopId: string;
  shopPublicId: string;
  currency: string;
}

export interface SettlementCurrencyChange {
  currency: string;
  previousCurrency: string;
  /** The instant the change takes effect, which is when it was requested. */
  effectiveFrom: Date;
  /** Always `false`: a change turns automatic payouts off. */
  autoPayoutEnabled: boolean;
}

/**
 * Moves a shop to a different Settlement Currency at a zero Seller Payable
 * position.
 *
 * A change never re-denominates anything already recorded. It closes the open
 * Settlement Currency history row, opens the new one with the provider's
 * Cutover Rate, moves `shops.currency`, turns automatic payouts off because the
 * recorded Payout Account no longer matches the currency, and closes that
 * account so no payout can be sent to it. Every rejection — a non-zero balance
 * in either direction, a pending Payout, an unchanged currency, or a change
 * inside the configured interval — is answered before anything is written.
 */
@Injectable()
export class ChangeSettlementCurrencyUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly settlementCurrencyRepository: SettlementCurrencyRepository,
    private readonly sellerPayableQueryRepository: SellerPayableQueryRepository,
    private readonly payoutQueryRepository: PayoutQueryRepository,
    private readonly payoutSettingsRepository: PayoutSettingsRepository,
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly fxRateService: FxRateService,
    private readonly auditLogService: AuditLogService,
    private readonly clock: Clock,
    @Inject(SETTLEMENT_CURRENCY_CONFIG)
    private readonly config: SettlementCurrencyConfig,
  ) {}

  async execute(
    input: ChangeSettlementCurrencyInput,
  ): Promise<SettlementCurrencyChange> {
    const currency = input.currency.trim().toUpperCase();

    if (!isMarketplaceCurrency(currency)) {
      throw new SettlementCurrencyUnsupportedError(currency);
    }

    const now = this.clock.now();

    const recorded = await this.entityManager.transactional(async (entityManager) => {
      const context = { entityManager };

      // Serializes this shop's changes: the history is re-read only after the
      // lock, so a concurrent request cannot grant a second change.
      await this.settlementCurrencyRepository.lockShopForChange(input.shopId, context);

      const currentCurrency = await this.settlementCurrencyRepository
        .ensureCurrentCurrency(input.shopId, context);

      if (!currentCurrency) {
        throw new ShopSettlementCurrencyUnresolvedError(input.shopId);
      }

      if (currentCurrency === currency) {
        throw new SettlementCurrencyUnchangedError(input.shopId, currency);
      }

      const position = await this.sellerPayableQueryRepository
        .findPositionByShopId(input.shopId, context);

      if (!position) {
        throw new ShopSettlementCurrencyUnresolvedError(input.shopId);
      }

      const [hasPendingPayout, openPeriod] = await Promise.all([
        this.payoutQueryRepository.hasPendingByShopId(input.shopId, context),
        this.settlementCurrencyRepository.findOpenPeriod(input.shopId, context),
      ]);

      // The settings read makes the same decision from the same state, so a
      // refusal shown there is this refusal, in this precedence.
      const eligibility = evaluateSettlementCurrencyChange({
        availableMinor: position.availableMinor,
        notYetAvailableMinor: position.notYetAvailableMinor,
        hasPendingPayout,
        openPeriod,
        intervalDays: this.config.changeIntervalDays,
        now,
      });

      if (!eligibility.allowed) {
        switch (eligibility.reason) {
          case 'balance_not_zero':
            throw new SettlementCurrencyBalanceNotZeroError(
              input.shopId,
              position.availableMinor,
              position.notYetAvailableMinor,
            );
          case 'payout_pending':
            throw new SettlementCurrencyChangePayoutPendingError(input.shopId);
          case 'change_too_soon':
            throw new SettlementCurrencyChangeTooSoonError(
              input.shopId,
              nextSettlementCurrencyChangeAt(
                openPeriod!.effectiveFrom,
                this.config.changeIntervalDays,
              ),
              this.config.changeIntervalDays,
            );
        }
      }

      if (!openPeriod) {
        throw new ShopSettlementCurrencyUnresolvedError(input.shopId);
      }

      const rate = await this.fxRateService.getLatestRate({
        fromCurrency: currentCurrency,
        toCurrency: currency,
        at: now,
      });

      if (!rate) {
        throw new SettlementCurrencyRateUnavailableError(currentCurrency, currency);
      }

      const cutoverRate = normalizeCutoverRate(rate.rate);

      const previousSettings = await this.payoutSettingsRepository
        .find(input.shopId, context);

      const period = await this.settlementCurrencyRepository.recordChange(
        {
          shopId: input.shopId,
          currency,
          previousCurrency: currentCurrency,
          cutoverRate,
          effectiveFrom: now,
        },
        context,
      );
      const settings = await this.payoutSettingsRepository.setAutoPayoutEnabled(
        input.shopId,
        false,
        now,
        context,
      );
      await this.payoutAccountRepository.closeActive(input.shopId, now, context);

      return {
        period,
        settings,
        previousSettings,
        previousCurrency: currentCurrency,
        cutoverRate,
        rateSource: rate.source,
      };
    });

    await this.auditLogService.record({
      action: 'finance.settlement_currency.changed',
      entityType: 'settlement_currency_history',
      entityId: input.shopId,
      entityPublicId: input.shopPublicId,
      summary: {
        shopId: input.shopId,
        previousCurrency: recorded.period.previousCurrency,
        currency: recorded.period.currency,
        effectiveFrom: recorded.period.effectiveFrom.toISOString(),
        cutoverRate: recorded.cutoverRate,
        cutoverRateSource: recorded.rateSource,
        autoPayoutEnabledBefore: recorded.previousSettings.autoPayoutEnabled,
        autoPayoutEnabled: recorded.settings.autoPayoutEnabled,
        availableMinor: 0,
        notYetAvailableMinor: 0,
      },
    });

    return {
      currency: recorded.period.currency,
      previousCurrency: recorded.previousCurrency,
      effectiveFrom: recorded.period.effectiveFrom,
      autoPayoutEnabled: recorded.settings.autoPayoutEnabled,
    };
  }
}

function isMarketplaceCurrency(currency: string): currency is MarketplaceCurrency {
  return MARKETPLACE_CURRENCIES.includes(currency as MarketplaceCurrency);
}
