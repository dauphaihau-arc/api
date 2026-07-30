import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { AppJobPayloadMap } from '~/integrations/queue/app/app-job.types';

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

    const failureReason = typeof order.paymentDetails?.['refund_failed_reason'] === 'string'
      ? order.paymentDetails['refund_failed_reason']
      : 'Our support team will review it.';

    await this.mailSender.send({
      to: { email: order.customerEmail },
      subject: `Refund update for order ${order.id}`,
      text:
        `We could not complete the refund for order ${order.id} from ${order.shop.shopName}. ` +
        `Reason: ${failureReason}. Our support team will follow up if needed.`,
      html:
        `<p>We could not complete the refund for order <strong>${order.id}</strong> from ${order.shop.shopName}.</p>` +
        `<p>Reason: ${failureReason}</p>` +
        '<p>Our support team will follow up if needed.</p>',
      tags: ['order-refund-failed'],
    });

    this.logger.log(`Processed refund failed email for order ${order.id}`);
  }
}
