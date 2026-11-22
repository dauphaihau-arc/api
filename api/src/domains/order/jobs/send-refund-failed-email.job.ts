import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { renderRefundFailedEmail } from '~/domains/order/app/outbound-messages/refund-emails.message';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';

type SendRefundFailedEmailPayload =
  AppJobPayloadMap['order.send-refund-failed-email'];

@Injectable()
export class SendRefundFailedEmailJob {
  private readonly logger = new Logger(SendRefundFailedEmailJob.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly mailSender: MailSender,
  ) {}

  async run(payload: SendRefundFailedEmailPayload): Promise<void> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      { id: payload.orderId },
      { populate: ['shop'] },
    );

    if (!order) {
      return;
    }

    const failureReason = order.paymentDetails?.['refund_failed_reason'];
    if (typeof failureReason === 'string') {
      this.logger.warn(
        `Refund failed email for order ${order.id}: ${failureReason}`,
      );
    }

    const rendered = renderRefundFailedEmail(order.language, {
      orderPublicId: order.publicId,
      shopName: order.shop.shopName,
    });

    await this.mailSender.send({
      to: { email: order.customerEmail },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tags: ['order-refund-failed'],
    });
    this.logger.log(`Processed refund failed email for order ${order.id}`);
  }
}
