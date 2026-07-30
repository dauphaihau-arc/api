import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { AppJobPayloadMap } from '~/integrations/queue/app/app-job.types';

type SendRefundSucceededEmailPayload =
  AppJobPayloadMap['order.send-refund-succeeded-email'];

@Injectable()
export class SendRefundSucceededEmailJob {
  private readonly logger = new Logger(SendRefundSucceededEmailJob.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly mailSender: MailSender,
  ) {}

  async run(payload: SendRefundSucceededEmailPayload): Promise<void> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      { id: payload.orderId },
      { populate: ['shop'] },
    );

    if (!order) {
      return;
    }

    const refundAmount = typeof order.paymentDetails?.['refund_amount'] === 'number'
      ? order.paymentDetails['refund_amount']
      : order.total;

    await this.mailSender.send({
      to: { email: order.customerEmail },
      subject: `Refund completed for order ${order.id}`,
      text:
        `Your refund for order ${order.id} from ${order.shop.shopName} has completed. ` +
        `Refund amount: ${refundAmount} ${order.currency}.`,
      html:
        `<p>Your refund for order <strong>${order.id}</strong> from ${order.shop.shopName} has completed.</p>` +
        `<p>Refund amount: <strong>${refundAmount} ${order.currency}</strong>.</p>`,
      tags: ['order-refund-succeeded'],
    });

    this.logger.log(`Processed refund succeeded email for order ${order.id}`);
  }
}
