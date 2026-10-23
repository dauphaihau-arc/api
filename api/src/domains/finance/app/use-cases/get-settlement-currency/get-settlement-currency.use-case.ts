import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '~/platform/time/clock';
import {
  SETTLEMENT_CURRENCY_CONFIG,
  type SettlementCurrencyConfig,
} from '~/platform/config/settlement-currency.config';
import { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import { PayoutSettingsRepository } from '../../ports/payout-settings.repository';
import { PayoutQueryRepository } from '../../ports/payout-query.repository';
import { SellerPayableQueryRepository } from '../../ports/seller-payable-query.repository';
import { ShopSettlementCurrencyUnresolvedError } from '../../errors/finance-app.error';
import {
  evaluateSettlementCurrencyChange,
  nextSettlementCurrencyChangeAt,
  type SettlementCurrencyChangeBlockedReason,
} from '../../../domain/rules/settlement-currency';

export interface GetSettlementCurrencyInput {
  shopId: string;
}

/** The shop's Settlement Currency as the seller settings read it. */
export interface SettlementCurrencyView {
  currency: string;

  /** When the current currency took effect. */
  effectiveFrom: Date;

  /** The currency the shop moved from, or `null` for its opening currency. */
  previousCurrency: string | null;

  /** The platform's minimum interval between two changes, in days. */
  changeIntervalDays: number;

  /**
   * When the shop may change currency again, or `null` when it never changed and
   * nothing is holding the first change back.
   */
  nextChangeAllowedAt: Date | null;

  autoPayoutEnabled: boolean;

  /**
   * Whether the shop's own state permits a change now. Target-specific refusals
   * — an unsupported or unchanged currency, or no rate — only appear on POST.
   */
  canChange: boolean;

  /** The state that blocks a change, or `null` when the shop may change. */
  blockedReason: SettlementCurrencyChangeBlockedReason | null;

  /** The shop's available Seller Payable, zero when it has no position row. */
  availableMinor: number;

  /** The shop's not-yet-available Seller Payable, zero when it has no row. */
  notYetAvailableMinor: number;

  /** Whether a Payout is still pending and holds the currency change back. */
  pendingPayout: boolean;
}

/**
 * Reads the shop's current Settlement Currency from its dated history — never
 * from the shop row alone — so a granted change is visible as soon as it is
 * committed, without rewriting any ledger row.
 */
@Injectable()
export class GetSettlementCurrencyUseCase {
  constructor(
    private readonly settlementCurrencyRepository: SettlementCurrencyRepository,
    private readonly payoutSettingsRepository: PayoutSettingsRepository,
    private readonly sellerPayableQueryRepository: SellerPayableQueryRepository,
    private readonly payoutQueryRepository: PayoutQueryRepository,
    private readonly clock: Clock,
    @Inject(SETTLEMENT_CURRENCY_CONFIG)
    private readonly config: SettlementCurrencyConfig,
  ) {}

  async execute(
    input: GetSettlementCurrencyInput,
  ): Promise<SettlementCurrencyView> {
    const currency = await this.settlementCurrencyRepository
      .ensureCurrentCurrency(input.shopId);

    if (!currency) {
      throw new ShopSettlementCurrencyUnresolvedError(input.shopId);
    }

    const now = this.clock.now();

    const [period, settings, position, hasPendingPayout] = await Promise.all([
      this.settlementCurrencyRepository.findOpenPeriod(input.shopId),
      this.payoutSettingsRepository.find(input.shopId),
      this.sellerPayableQueryRepository.findPositionByShopId(input.shopId),
      this.payoutQueryRepository.hasPendingByShopId(input.shopId),
    ]);

    const availableMinor = position?.availableMinor ?? 0;
    const notYetAvailableMinor = position?.notYetAvailableMinor ?? 0;

    // The command evaluates the same state with the same rule, so this reason
    // is the refusal the seller would get from POST.
    const eligibility = evaluateSettlementCurrencyChange({
      availableMinor,
      notYetAvailableMinor,
      hasPendingPayout,
      openPeriod: period,
      intervalDays: this.config.changeIntervalDays,
      now,
    });

    return {
      currency,
      effectiveFrom: period?.effectiveFrom ?? now,
      previousCurrency: period?.previousCurrency ?? null,
      changeIntervalDays: this.config.changeIntervalDays,
      nextChangeAllowedAt: period?.previousCurrency
        ? nextSettlementCurrencyChangeAt(
          period.effectiveFrom,
          this.config.changeIntervalDays,
        )
        : null,
      autoPayoutEnabled: settings.autoPayoutEnabled,
      canChange: eligibility.allowed,
      blockedReason: eligibility.allowed ? null : eligibility.reason,
      availableMinor,
      notYetAvailableMinor,
      pendingPayout: hasPendingPayout,
    };
  }
}
