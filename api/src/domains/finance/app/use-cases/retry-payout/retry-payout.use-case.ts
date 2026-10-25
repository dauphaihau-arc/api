import { Injectable, Logger } from '@nestjs/common';
import { PayoutAccountRepository } from '../../ports/payout-account.repository';
import { PayoutCommandRepository } from '../../ports/payout-command.repository';
import type { PendingPayoutAttempt } from '../../ports/payout-command.repository';
import { PayoutAttemptService } from '../../services/payout-attempt.service';
import { PayoutNotificationService } from '../../services/payout-notification.service';

/**
 * One scheduled retry of a Payout whose provider attempt failed.
 *
 * The job carries only the Payout's id: the amount, the Orders, and the
 * destination account were captured when the Payout was claimed, so the retry
 * settles exactly what was claimed even if a refund or an account change landed
 * in between. A stale or duplicated job finds the Payout no longer `pending` and
 * does nothing, and the provider's idempotency key makes a duplicated transfer
 * harmless.
 */
@Injectable()
export class RetryPayoutUseCase {
  private readonly logger = new Logger(RetryPayoutUseCase.name);

  constructor(
    private readonly payoutCommandRepository: PayoutCommandRepository,
    private readonly payoutAccountRepository: PayoutAccountRepository,
    private readonly payoutAttemptService: PayoutAttemptService,
    private readonly payoutNotificationService: PayoutNotificationService,
  ) {}

  async execute(payoutId: string): Promise<void> {
    const pending = await this.payoutCommandRepository.findPendingAttempt(payoutId);

    if (!pending) {
      return;
    }

    // A retry without the claim's allocations could not record what it
    // discharged, which would let the same Orders be paid again. No new claim
    // can be in that state, so the safe outcome is a terminal failure.
    if (pending.allocations.length === 0) {
      await this.failTerminally(pending, 'payout_claim_incomplete');
      return;
    }

    const target = await this.payoutAccountRepository.findPaymentTargetById(
      pending.payoutAccountId,
    );

    if (!target) {
      await this.failTerminally(pending, 'payout_account_missing');
      return;
    }

    const outcome = await this.payoutAttemptService.attempt({
      payout: {
        id: pending.id,
        publicId: pending.publicId,
        shopId: pending.shopId,
        currency: pending.currency,
        amountMinor: pending.amountMinor,
        source: pending.source,
        // The conversion was frozen at claim, so a retry sends the same transfer
        // amount in the same currency even if the market has moved since.
        targetCurrency: pending.targetCurrency,
        transferCurrency: pending.transferCurrency,
        transferAmountMinor: pending.transferAmountMinor,
        fxRate: pending.fxRate,
        targetAmountMinor: pending.targetAmountMinor,
      },
      target,
      allocations: pending.allocations,
    });

    this.logger.log(`Retried Payout ${pending.id}: ${outcome}`);
  }

  private async failTerminally(
    pending: PendingPayoutAttempt,
    reason: string,
  ): Promise<void> {
    const failed = await this.payoutCommandRepository.markFailed({
      payoutId: pending.id,
      reason,
    });

    if (!failed) {
      return;
    }

    if (pending.source === 'manual') {
      await this.payoutCommandRepository.releaseQuota(pending.id, {});
    }

    await this.payoutNotificationService.notifyOutcome(pending.id, 'failed');
  }
}
