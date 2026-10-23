import { Injectable, Logger } from '@nestjs/common';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import { fromMinorUnits } from '~/platform/money/money';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';
import { PayoutQueryRepository } from '../app/ports/payout-query.repository';

type SendPayoutSucceededEmailPayload =
  AppJobPayloadMap['finance.send-payout-succeeded-email'];

/**
 * Tells the shop owner that a Payout reached the seller's account. Sent once per
 * terminal success, after the discharge committed, so the amount in the email is
 * the amount the ledger recorded.
 */
@Injectable()
export class SendPayoutSucceededEmailJob {
  private readonly logger = new Logger(SendPayoutSucceededEmailJob.name);

  constructor(
    private readonly payoutQueryRepository: PayoutQueryRepository,
    private readonly mailSender: MailSender,
  ) {}

  async run(payload: SendPayoutSucceededEmailPayload): Promise<void> {
    const facts = await this.payoutQueryRepository.findNotificationFacts(
      payload.payoutId,
    );

    if (!facts?.recipientEmail) {
      return;
    }

    const amount = `${fromMinorUnits(facts.payoutAmountMinor, facts.currency)} ${facts.currency}`;
    const source = facts.source === 'manual' ? 'manual withdrawal' : 'scheduled payout';

    await this.mailSender.send({
      to: {
        email: facts.recipientEmail,
        name: facts.recipientDisplayName ?? facts.shopName,
      },
      subject: `Payout ${facts.payoutNumber} sent`,
      text:
        `Your ${source} ${facts.payoutNumber} for ${amount} has been sent to your payout account. ` +
        `Shop: ${facts.shopName}.`,
      html:
        `<p>Your ${source} <strong>${facts.payoutNumber}</strong> for <strong>${amount}</strong> has been sent to your payout account.</p>` +
        `<p>Shop: ${facts.shopName}</p>`,
      tags: ['payout-succeeded', 'seller-payout'],
    });

    this.logger.log(`Processed payout succeeded email for payout ${facts.payoutId}`);
  }
}
