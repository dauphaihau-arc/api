import { Clock } from '~/platform/time/clock';
import {
  PAYOUT_CONNECT_COUNTRIES_CONFIG,
  type PayoutConnectCountriesConfig,
} from '~/platform/config/payout-country.config';
import { Inject, Injectable } from '@nestjs/common';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import {
  PayoutSettingsRepository,
  type PayoutSettingsRecord,
} from '../../ports/payout-settings.repository';
import { PayoutAccountRepository } from '../../ports/payout-account.repository';
import { SettlementCurrencyRepository } from '../../ports/settlement-currency.repository';
import { AutoPayoutIneligibleError } from '../../errors/finance-app.error';
import { resolveAutoPayoutEligibility } from '../../services/payout-eligibility';

export interface SetAutoPayoutEnabledInput {
  shopId: string;
  shopPublicId: string;
  autoPayoutEnabled: boolean;
}

/**
 * Opts a shop in to, or out of, automatic Payout Runs. The choice belongs to the
 * seller, takes effect from the next run, and is audited because it decides
 * whether money leaves without a seller asking each time.
 */
@Injectable()
export class SetAutoPayoutEnabledUseCase {
  constructor(
    private readonly payoutSettingsRepository: PayoutSettingsRepository,
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly settlementCurrencyRepository: SettlementCurrencyRepository,
    private readonly auditLogService: AuditLogService,
    private readonly clock: Clock,
    @Inject(PAYOUT_CONNECT_COUNTRIES_CONFIG)
    private readonly payoutConnectCountriesConfig: PayoutConnectCountriesConfig,
  ) {}

  async execute(
    input: SetAutoPayoutEnabledInput,
  ): Promise<PayoutSettingsRecord> {
    if (input.autoPayoutEnabled) {
      const [account, settlementCurrency] = await Promise.all([
        this.payoutAccountRepository.findActiveByShopId(input.shopId),
        this.settlementCurrencyRepository.ensureCurrentCurrency(input.shopId),
      ]);
      const eligibility = resolveAutoPayoutEligibility(
        account,
        settlementCurrency,
        this.payoutConnectCountriesConfig.countries,
      );

      if (!eligibility.eligible) {
        throw new AutoPayoutIneligibleError(
          input.shopId,
          eligibility.reason ?? 'no_payout_account',
        );
      }
    }

    const settings = await this.payoutSettingsRepository.setAutoPayoutEnabled(
      input.shopId,
      input.autoPayoutEnabled,
      this.clock.now(),
    );

    await this.auditLogService.record({
      action: 'finance.payout_settings.updated',
      entityType: 'payout_settings',
      entityId: input.shopId,
      entityPublicId: input.shopPublicId,
      summary: {
        shopId: input.shopId,
        autoPayoutEnabled: settings.autoPayoutEnabled,
      },
    });

    return settings;
  }
}
