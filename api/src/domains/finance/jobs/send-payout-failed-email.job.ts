import { Injectable, Logger } from '@nestjs/common';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import { fromMinorUnits } from '~/platform/money/money';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { PayoutQueryRepository } from '../app/ports/payout-query.repository';

type SendPayoutFailedEmailPayload =
  AppJobPayloadMap['finance.send-payout-failed-email'];

/**
 * Tells the shop owner that a Payout ran out of attempts. Sent once per terminal
 * failure, after the failed transition committed; it names the reason to act on
 * and leaves the seller's balance untouched.
 */
@Injectable()
export class SendPayoutFailedEmailJob {
  private readonly logger = new Logger(SendPayoutFailedEmailJob.name);

  constructor(
    private readonly payoutQueryRepository: PayoutQueryRepository,
    private readonly mailSender: MailSender,
  ) {}

  async run(payload: SendPayoutFailedEmailPayload): Promise<void> {
    const facts = await this.payoutQueryRepository.findNotificationFacts(
      payload.payoutId,
    );

    if (!facts?.recipientEmail) {
      return;
    }

    const amount = `${fromMinorUnits(facts.payoutAmountMinor, facts.currency)} ${facts.currency}`;
    const source = facts.source === 'manual' ? 'manual withdrawal' : 'scheduled payout';
    const reason = facts.reason ?? 'the provider declined the transfer';

    await this.mailSender.send({
      to: {
        email: facts.recipientEmail,
        name: facts.recipientDisplayName ?? facts.shopName,
      },
      subject: `Payout ${facts.payoutNumber} failed`,
      text:
        `Your ${source} ${facts.payoutNumber} for ${amount} failed: ${reason}. ` +
        `No money left your available balance. Shop: ${facts.shopName}.`,
      html:
        `<p>Your ${source} <strong>${facts.payoutNumber}</strong> for <strong>${amount}</strong> failed: ${reason}.</p>` +
        '<p>No money left your available balance.</p>' +
        `<p>Shop: ${facts.shopName}</p>`,
      tags: ['payout-failed', 'seller-payout'],
    });

    this.logger.log(`Processed payout failed email for payout ${facts.payoutId}`);
  }
}
