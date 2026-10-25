import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '~/platform/time/clock';
import {
  PAYOUT_CONFIG,
  type PayoutConfig,
} from '~/platform/config/payout.config';
import {
  PAYOUT_CONNECT_COUNTRIES_CONFIG,
  type PayoutConnectCountriesConfig,
} from '~/platform/config/payout-country.config';
import { PayoutQueryRepository } from '../../ports/payout-query.repository';
import { PayoutSettingsRepository } from '../../ports/payout-settings.repository';
import { PayoutAccountRepository } from '../../ports/payout-account.repository';
import { SellerPayableQueryRepository } from '../../ports/seller-payable-query.repository';
import {
  resolveAutoPayoutEligibility,
  type AutoPayoutIneligibleReason,
} from '../../services/payout-eligibility';
import { payoutPeriodKey } from '../../../domain/rules/payout';

export interface GetPayoutSettingsInput {
  shopId: string;
}

/** A shop's payout preferences plus what is left of this month's allowance. */
export interface PayoutSettingsView {
  autoPayoutEnabled: boolean;
  autoPayoutDayOfMonth: number;
  autoPayoutEligible: boolean;
  autoPayoutIneligibleReason: AutoPayoutIneligibleReason | null;

  /**
   * `1` while the shop may still withdraw manually this month, `0` once it has,
   * and `null` when the platform allows unlimited manual withdrawals.
   */
  manualWithdrawalsRemaining: number | null;
}

/**
 * Reads a shop's payout preferences. The remaining manual allowance is derived
 * from the month's Payouts rather than stored, so it cannot drift from what the
 * claim index will accept.
 */
@Injectable()
export class GetPayoutSettingsUseCase {
  constructor(
    @Inject(PAYOUT_CONFIG) private readonly config: PayoutConfig,
    private readonly payoutSettingsRepository: PayoutSettingsRepository,
    private readonly payoutQueryRepository: PayoutQueryRepository,
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly sellerPayableQueryRepository: SellerPayableQueryRepository,
    private readonly clock: Clock,
    @Inject(PAYOUT_CONNECT_COUNTRIES_CONFIG)
    private readonly payoutConnectCountriesConfig: PayoutConnectCountriesConfig,
  ) {}

  async execute(input: GetPayoutSettingsInput): Promise<PayoutSettingsView> {
    const settings = await this.payoutSettingsRepository.find(input.shopId);

    const manualWithdrawalsRemaining = this.config.manualWithdrawalUnlimited
      ? null
      : (await this.payoutQueryRepository.hasConsumedManualPayout(
        input.shopId,
        payoutPeriodKey(this.clock.now()),
      )
        ? 0
        : 1);

    const [account, balance] = await Promise.all([
      this.payoutAccountRepository.findActiveByShopId(input.shopId),
      this.sellerPayableQueryRepository.findBalanceByShopId(input.shopId),
    ]);

    const eligibility = resolveAutoPayoutEligibility(
      account,
      balance?.currency ?? null,
      this.payoutConnectCountriesConfig.countries,
    );

    return {
      autoPayoutEnabled: settings.autoPayoutEnabled,
      autoPayoutDayOfMonth: this.config.autoPayoutDayOfMonth,
      autoPayoutEligible: eligibility.eligible,
      autoPayoutIneligibleReason: eligibility.reason,
      manualWithdrawalsRemaining,
    };
  }
}
