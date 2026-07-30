import { Injectable, Logger } from '@nestjs/common';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { AppJobPayloadMap } from '~/integrations/queue/app/app-job.types';

type SendGuestOrderConfirmationEmailPayload =
  AppJobPayloadMap['order.send-guest-confirmation-email'];

@Injectable()
export class SendGuestOrderConfirmationEmailJob {
  private readonly logger = new Logger(SendGuestOrderConfirmationEmailJob.name);

  constructor(private readonly mailSender: MailSender) {}

  async run(payload: SendGuestOrderConfirmationEmailPayload): Promise<void> {
    const orderList = payload.orderIds.join(', ');
    const shopSummary = payload.shopNames.length > 0
      ? payload.shopNames.join(', ')
      : 'our marketplace';

    await this.mailSender.send({
      to: { email: payload.email },
      subject: 'Your guest order confirmation',
      text:
        `Thanks for your order from ${shopSummary}. ` +
        `Order ID${payload.orderIds.length > 1 ? 's' : ''}: ${orderList}. ` +
        `Track your order here: ${payload.trackingUrl}`,
      html:
        `<p>Thanks for your order from ${shopSummary}.</p>` +
        `<p>Order ID${payload.orderIds.length > 1 ? 's' : ''}: ${orderList}</p>` +
        `<p><a href="${payload.trackingUrl}">Track your order</a></p>`,
      tags: ['guest-order-confirmation'],
    });

    this.logger.log(
      `Processed guest order confirmation email for ${payload.email} (${orderList})`,
    );
  }
}
