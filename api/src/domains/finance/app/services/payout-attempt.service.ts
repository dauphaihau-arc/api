import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldEncryptionService } from '~/platform/crypto/field-encryption.service';
import { Clock } from '~/platform/time/clock';
import {
  PAYOUT_CONFIG,
  type PayoutConfig,
} from '~/platform/config/payout.config';
import {
  PayoutGateway,
  type PayoutTransferInput,
} from '~/integrations/payment/app/ports/payout-gateway';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { appJobName } from '~/platform/jobs/app-job.names';
import { JournalEntryRepository } from '../ports/journal-entry.repository';
import type {
  PayoutAccountPaymentTarget,
} from '../ports/payout-account.repository';
import { PayoutCommandRepository } from '../ports/payout-command.repository';
import { SellerPayableCommandRepository } from '../ports/seller-payable-command.repository';
import {
  buildPaidPayoutPostings,
  paidPayoutMoneyEventKey,
  payoutRetryDelayMs,
  type PayoutAllocation,
  type PayoutSource,
} from '../../domain/rules/payout';
import { PayoutNotificationService } from './payout-notification.service';

const PAID_PAYOUT_MONEY_EVENT_KIND = 'payout.paid';

/** What one provider attempt on a claimed Payout did. */
export type PayoutAttemptOutcome = 'paid' | 'retrying' | 'failed' | 'skipped';

export interface PayoutAttemptInput {
  payout: {
    id: string;
    publicId: string;
    shopId: string;
    currency: string;
    amountMinor: number;
    source: PayoutSource;
  };

  /** The destination captured when the Payout was claimed, not the shop's current one. */
  target: PayoutAccountPaymentTarget;

  /** The Orders the Payout claimed, frozen at claim time. */
  allocations: PayoutAllocation[];
}

/**
 * Sends one claimed Payout through the provider port and records what happened.
 *
 * Success settles the Payout, its Journal Entry, and the discharge of Seller
 * Payable in one transaction, then notifies the seller once. Failure never holds
 * the caller open: the same `pending` row keeps its claim, its failure count
 * grows, and the next bounded attempt is a delayed job (`payout.retry`) rather
 * than a sleep. When no attempt is left, the Payout becomes `failed` with the
 * provider's reason — no balance moves and no Journal Entry is written — and the
 * seller hears about it once. A manual failure gives its monthly quota back so
 * the seller can choose to try again; a scheduled one keeps the month consumed.
 */
@Injectable()
export class PayoutAttemptService {
  private readonly logger = new Logger(PayoutAttemptService.name);

  constructor(
    private readonly entityManager: EntityManager,
    @Inject(PAYOUT_CONFIG) private readonly payoutConfig: PayoutConfig,
    private readonly payoutCommandRepository: PayoutCommandRepository,
    private readonly sellerPayableRepository: SellerPayableCommandRepository,
    private readonly journalEntryRepository: JournalEntryRepository,
    private readonly payoutGateway: PayoutGateway,
    private readonly fieldEncryptionService: FieldEncryptionService,
    private readonly payoutNotificationService: PayoutNotificationService,
    private readonly jobDispatcher: JobDispatcher,
    private readonly clock: Clock,
  ) {}

  async attempt(input: PayoutAttemptInput): Promise<PayoutAttemptOutcome> {
    const { payout } = input;

    let transfer;

    try {
      transfer = await this.payoutGateway.send(this.buildTransferInput(input));
    }
    catch (error) {
      return this.recordFailure(input, error);
    }

    const settled = await this.entityManager.transactional(async (entityManager) => {
      const paidAt = this.clock.now();

      // The transition from `pending` to `paid` is what the Journal Entry and
      // the discharge hang on, so a duplicated provider call or a replayed job
      // never discharges the same Seller Payable twice.
      const transitioned = await this.payoutCommandRepository.settle(
        {
          payoutId: payout.id,
          providerReference: transfer.reference,
          paidAt,
          orders: input.allocations,
        },
        { entityManager },
      );

      if (!transitioned) {
        return false;
      }

      await this.journalEntryRepository.append(
        {
          moneyEventKey: paidPayoutMoneyEventKey(payout.id),
          moneyEventKind: PAID_PAYOUT_MONEY_EVENT_KIND,
          shopId: payout.shopId,
          currency: payout.currency,
          occurredAt: paidAt,
          postings: buildPaidPayoutPostings({
            shopId: payout.shopId,
            currency: payout.currency,
            amountMinor: payout.amountMinor,
          }),
        },
        { entityManager },
      );

      await this.sellerPayableRepository.dischargeAvailable(
        payout.shopId,
        payout.currency,
        payout.amountMinor,
        { entityManager },
      );

      await entityManager.flush();

      return true;
    });

    if (!settled) {
      this.logger.error(
        `Payout ${payout.id} for shop ${payout.shopId} was not pending at settle time; nothing was discharged`,
      );

      return 'skipped';
    }

    await this.payoutNotificationService.notifyOutcome(payout.id, 'succeeded');

    return 'paid';
  }

  /**
   * Records a failed attempt and decides what happens next: schedule the next
   * bounded attempt, or make the failure terminal. A failure whose row is no
   * longer `pending` belongs to a resolve that already won, so it writes nothing.
   */
  private async recordFailure(
    input: PayoutAttemptInput,
    error: unknown,
  ): Promise<PayoutAttemptOutcome> {
    const { payout } = input;
    const reason = this.readFailureReason(error);

    const failedAttempts = await this.payoutCommandRepository.recordAttemptFailure(
      payout.id,
    );

    if (failedAttempts === null) {
      return 'skipped';
    }

    this.logger.warn(
      `Payout ${payout.id} for shop ${payout.shopId} failed attempt ${failedAttempts}: ${reason}`,
    );

    const delayMs = payoutRetryDelayMs(
      failedAttempts + 1,
      this.payoutConfig.retryDelaysMs,
    );

    if (delayMs !== null) {
      try {
        await this.jobDispatcher.dispatch(
          appJobName.retryPayout,
          { payoutId: payout.id },
          { delayMs },
        );

        return 'retrying';
      }
      catch (dispatchError) {
        this.logger.error(
          `Could not schedule Payout ${payout.id} retry; marking it failed`,
          dispatchError instanceof Error ? dispatchError.stack : undefined,
        );
      }
    }

    return this.markTerminallyFailed(input, reason);
  }

  /**
   * Makes an exhausted Payout `failed` and tells the seller once. No Seller
   * Payable movement and no Journal Entry: nothing was ever discharged.
   */
  private async markTerminallyFailed(
    input: PayoutAttemptInput,
    reason: string,
  ): Promise<PayoutAttemptOutcome> {
    const { payout } = input;

    const failed = await this.payoutCommandRepository.markFailed({
      payoutId: payout.id,
      reason,
    });

    if (!failed) {
      return 'skipped';
    }

    if (payout.source === 'manual') {
      // The seller's own request gets its monthly allowance back, so the seller
      // can try again this month. A scheduled failure keeps the month consumed.
      await this.payoutCommandRepository.releaseQuota(payout.id, {});
    }

    await this.payoutNotificationService.notifyOutcome(payout.id, 'failed');

    return 'failed';
  }

  private buildTransferInput(input: PayoutAttemptInput): PayoutTransferInput {
    const { payout, target } = input;

    return {
      // The Payout's own public id is the provider idempotency key, so a retry
      // can never create a second transfer for the same Payout.
      payoutPublicId: payout.publicId,
      provider: target.provider,
      amountMinor: payout.amountMinor,
      currency: payout.currency,
      destination: {
        type: target.type,
        holderName: target.holderName,
        bankName: target.bankName,
        country: target.country,
        last4: target.last4,
        reference: this.fieldEncryptionService.decrypt(target.providerRefEncrypted),
      },
    };
  }

  private readFailureReason(error: unknown): string {
    const message = error instanceof Error ? error.message.trim() : '';

    return message.length > 0 ? message : 'provider_transfer_failed';
  }
}
