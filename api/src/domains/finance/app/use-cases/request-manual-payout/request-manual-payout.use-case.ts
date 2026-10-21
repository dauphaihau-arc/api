import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '~/platform/time/clock';
import {
  PAYOUT_CONFIG,
  type PayoutConfig,
} from '~/platform/config/payout.config';
import { PayoutQueryRepository } from '../../ports/payout-query.repository';
import { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import type { PayoutRecord } from '../../ports/payout.types';
import { PayShopUseCase } from '../pay-shop/pay-shop.use-case';
import {
  ManualPayoutAlreadyUsedError,
  NoPayableAmountError,
  ShopSettlementCurrencyUnresolvedError,
} from '../../errors/finance-app.error';
import { payoutPeriodKey, payoutRunDay } from '../../../domain/rules/payout';

export interface RequestManualPayoutInput {
  shopId: string;
  requestedByUserId: string;

  /** The amount to withdraw in minor units; omitted means everything available. */
  amountMinor?: number;
}

/**
 * A seller's own withdrawal, paid through the same path as the automatic run.
 *
 * The default is to withdraw the whole net payable. By default a shop gets one
 * manual withdrawal per platform month; the env flag lifts that limit, and a
 * lifted limit still records the month and the requesting seller. No Payout
 * Account means the request is refused outright, with no Blocked Payout left
 * behind: that fact belongs to scheduled runs.
 */
@Injectable()
export class RequestManualPayoutUseCase {
  constructor(
    @Inject(PAYOUT_CONFIG) private readonly config: PayoutConfig,
    private readonly payoutQueryRepository: PayoutQueryRepository,
    private readonly settlementCurrencyRepository: SettlementCurrencyRepository,
    private readonly payShopUseCase: PayShopUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(input: RequestManualPayoutInput): Promise<PayoutRecord> {
    const now = this.clock.now();
    const periodKey = payoutPeriodKey(now);

    // Checked here for a clear refusal; the claim's unique index is what makes
    // it hold against a concurrent request.
    if (
      !this.config.manualWithdrawalUnlimited
      && await this.payoutQueryRepository.hasConsumedManualPayout(
        input.shopId,
        periodKey,
      )
    ) {
      throw new ManualPayoutAlreadyUsedError(input.shopId, periodKey);
    }

    const currency = await this.settlementCurrencyRepository
      .ensureCurrentCurrency(input.shopId);

    if (!currency) {
      throw new ShopSettlementCurrencyUnresolvedError(input.shopId);
    }

    const result = await this.payShopUseCase.execute({
      shopId: input.shopId,
      currency,
      runDay: payoutRunDay(now),
      source: 'manual',
      periodKey,
      requestedByUserId: input.requestedByUserId,
      amountMinor: input.amountMinor,
      quotaConsumed: !this.config.manualWithdrawalUnlimited,
    });

    if (!result.payout) {
      throw new NoPayableAmountError(input.shopId);
    }

    return result.payout;
  }
}
