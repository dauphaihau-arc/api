import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '~/platform/time/clock';
import {
  PAYOUT_CONFIG,
  type PayoutConfig,
} from '~/platform/config/payout.config';
import { PayoutQueryRepository } from '../../ports/payout-query.repository';
import { PayShopUseCase } from '../pay-shop/pay-shop.use-case';
import {
  isAutoPayoutDue,
  payoutPeriodKey,
  payoutRunDay,
} from '../../../domain/rules/payout';

/** What one run did, for the worker's log and for verification. */
export interface PayoutRunSummary {
  runDay: string;
  paidShopCount: number;
  blockedShopCount: number;
  skippedShopCount: number;
}

/**
 * One execution of the automatic Payout Run.
 *
 * It is due only on the configured platform day of the month, and pays only
 * shops that opted in before that day's UTC start. A local/E2E force flag makes
 * it due now without bypassing the monthly claim. The monthly claim — not the
 * tick cadence — is what makes it pay a shop at most once per platform month, so
 * the worker may keep ticking without paying the same balance again.
 *
 * Each shop is paid independently: a shop's claim or provider outcome never
 * decides another shop's, and one failure skips that shop rather than the run.
 */
@Injectable()
export class RunPayoutsUseCase {
  private readonly logger = new Logger(RunPayoutsUseCase.name);

  constructor(
    @Inject(PAYOUT_CONFIG) private readonly config: PayoutConfig,
    private readonly payoutQueryRepository: PayoutQueryRepository,
    private readonly payShopUseCase: PayShopUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<PayoutRunSummary> {
    const now = this.clock.now();
    const runDay = payoutRunDay(now);

    const summary: PayoutRunSummary = {
      runDay,
      paidShopCount: 0,
      blockedShopCount: 0,
      skippedShopCount: 0,
    };

    if (
      !this.config.autoPayoutForceDue
      && !isAutoPayoutDue(now, this.config.autoPayoutDayOfMonth)
    ) {
      return summary;
    }

    const periodKey = payoutPeriodKey(now);

    // Forced local/E2E runs treat `now` as the payout-day start, so a shop
    // enabled earlier today is eligible; strict scheduling keeps the real
    // UTC start of the configured day.
    const payoutDayStartUtc = this.config.autoPayoutForceDue
      ? now
      : new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        this.config.autoPayoutDayOfMonth,
      ));

    const shops = await this.payoutQueryRepository.findAutoPayoutShops(
      payoutDayStartUtc,
    );

    for (const shop of shops) {
      try {
        const result = await this.payShopUseCase.execute({
          shopId: shop.shopId,
          currency: shop.currency,
          runDay,
          source: 'scheduled',
          periodKey,
          quotaConsumed: true,
        });

        if (result.outcome === 'paid') {
          summary.paidShopCount += 1;
        }
        else if (result.outcome === 'blocked') {
          summary.blockedShopCount += 1;
        }
        else {
          summary.skippedShopCount += 1;
        }
      }
      catch (error) {
        // A provider failure leaves the shop's claimed Payout pending and skips
        // this shop for the month; turning exhausted attempts into a failed
        // Payout belongs to the Payout failure slice, not to the run's loop.
        summary.skippedShopCount += 1;

        this.logger.error(
          `Payout run skipped shop ${shop.shopId} on ${runDay}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return summary;
  }
}
