import { Injectable, Logger } from '@nestjs/common';
import {
  renderGuestOrderConfirmationEmail,
  resolveGuestOrderConfirmationLanguage,
  resolveGuestOrderConfirmationShopSummary,
} from '~/domains/order/app/outbound-messages/guest-order-confirmation.message';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';

type SendGuestOrderConfirmationEmailPayload =
  AppJobPayloadMap['order.send-guest-confirmation-email'];

@Injectable()
export class SendGuestOrderConfirmationEmailJob {
  private readonly logger = new Logger(SendGuestOrderConfirmationEmailJob.name);

  constructor(private readonly mailSender: MailSender) {}

  async run(payload: SendGuestOrderConfirmationEmailPayload): Promise<void> {
    const orderList = payload.orderIds.join(', ');
    const language = resolveGuestOrderConfirmationLanguage(payload.language);

    const rendered = renderGuestOrderConfirmationEmail(language, {
      orderNumbers: orderList,
      shopNames: resolveGuestOrderConfirmationShopSummary(payload.shopNames, language),
      trackingUrl: payload.trackingUrl,
    });

    await this.mailSender.send({
      to: { email: payload.email },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tags: ['guest-order-confirmation'],
    });

    this.logger.log(
      `Processed guest order confirmation email for ${payload.email} ` +
        `(${payload.language}): ${orderList}`,
    );
  }
}
