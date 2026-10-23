import { Injectable, Logger } from '@nestjs/common';
import { appJobName } from '~/platform/jobs/app-job.names';
import { NotifyUserUseCase } from '~/domains/notification/app/use-cases/notify-user/notify-user.use-case';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { PayoutQueryRepository } from '../ports/payout-query.repository';
import {
  buildSellerPayoutNotification,
  type PayoutNotificationOutcome,
} from '../payout-notification';

/**
 * Tells a seller that a Payout reached its terminal outcome: one in-app
 * notification and one email job, on success and on failure alike. Nothing is
 * sent while a Payout is retrying, so a provider outage produces one message
 * rather than one per attempt.
 *
 * Notification failure is isolated: the Payout's money fact is already written,
 * so a mail or notification problem must not turn a paid Payout into an error.
 */
@Injectable()
export class PayoutNotificationService {
  private readonly logger = new Logger(PayoutNotificationService.name);

  constructor(
    private readonly payoutQueryRepository: PayoutQueryRepository,
    private readonly notifyUserUseCase: NotifyUserUseCase,
    private readonly jobDispatcher: JobDispatcher,
  ) {}

  async notifyOutcome(
    payoutId: string,
    outcome: PayoutNotificationOutcome,
  ): Promise<void> {
    try {
      const facts = await this.payoutQueryRepository.findNotificationFacts(payoutId);

      if (!facts) {
        this.logger.warn(`No Payout ${payoutId} to notify ${outcome} about`);
        return;
      }

      await this.jobDispatcher.dispatch(
        outcome === 'succeeded'
          ? appJobName.sendPayoutSucceededEmail
          : appJobName.sendPayoutFailedEmail,
        { payoutId },
      );

      if (facts.recipientUserId) {
        await this.notifyUserUseCase.execute(
          buildSellerPayoutNotification(facts, outcome),
        );
      }
    }
    catch (error) {
      this.logger.error(
        `Failed to notify Payout ${payoutId} ${outcome}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
