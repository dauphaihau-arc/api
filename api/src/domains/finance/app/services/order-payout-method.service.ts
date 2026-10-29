import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '~/platform/time/clock';
import {
  PAYOUT_CONFIG,
  type PayoutConfig,
} from '~/platform/config/payout.config';
import { nextPayoutRunDate } from '../../domain/rules/payout';
import type { PayoutAccountStatus } from '../../domain/rules/payout-account';
import { PayoutAccountRepository } from '../ports/payout-account.repository';
import { PayoutSettingsRepository } from '../ports/payout-settings.repository';

/**
 * The Payout Account state a seller or admin timeline shows. `missing` is not a
 * provider status: it means the shop has no open Payout Account at all.
 */
export type OrderPayoutAccountStatus = PayoutAccountStatus | 'missing';

/**
 * How this Order's money will reach the shop: the account it will be sent to
 * and when the next automatic run would take it. Dates are day-precision UTC
 * calendar dates and only exist when the platform actually has one scheduled.
 */
export interface OrderPayoutMethod {
  accountStatus: OrderPayoutAccountStatus;
  autoPayoutEnabled: boolean;
  autoPayoutDayOfMonth: number;

  /** `YYYY-MM-DD`; null when no automatic run is scheduled. */
  nextPayoutDate: string | null;
}

export interface ResolveOrderPayoutMethodInput {
  /** The shop's open Payout Account status, or null when it has none. */
  accountStatus: PayoutAccountStatus | null;
  autoPayoutEnabled: boolean;
  autoPayoutDayOfMonth: number;
  /** The instant the next run is resolved against. */
  now: Date;
}

/**
 * Builds the payout-method facts shared by the seller and admin order
 * timelines. An automatic run is only scheduled for an `active` account, so a
 * missing or unverified one never produces a date the platform would not honor.
 */
export function resolveOrderPayoutMethod(
  input: ResolveOrderPayoutMethodInput,
): OrderPayoutMethod {
  const accountStatus: OrderPayoutAccountStatus = input.accountStatus ?? 'missing';

  return {
    accountStatus,
    autoPayoutEnabled: input.autoPayoutEnabled,
    autoPayoutDayOfMonth: input.autoPayoutDayOfMonth,
    nextPayoutDate: input.autoPayoutEnabled && accountStatus === 'active'
      ? nextPayoutRunDate(input.now, input.autoPayoutDayOfMonth)
      : null,
  };
}

/**
 * Reads the shop-level facts behind an Order's payout method — its open Payout
 * Account and its payout preferences — and combines them with the platform's
 * automatic run day. Finance owns these facts; the Order's own commercial
 * status never decides them.
 */
@Injectable()
export class OrderPayoutMethodService {
  constructor(
    @Inject(PAYOUT_CONFIG) private readonly config: PayoutConfig,
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly payoutSettingsRepository: PayoutSettingsRepository,
    private readonly clock: Clock,
  ) {}

  async resolve(shopId: string): Promise<OrderPayoutMethod> {
    const [account, settings] = await Promise.all([
      this.payoutAccountRepository.findActiveByShopId(shopId),
      this.payoutSettingsRepository.find(shopId),
    ]);

    return resolveOrderPayoutMethod({
      accountStatus: account?.status ?? null,
      autoPayoutEnabled: settings.autoPayoutEnabled,
      autoPayoutDayOfMonth: this.config.autoPayoutDayOfMonth,
      now: this.clock.now(),
    });
  }
}
