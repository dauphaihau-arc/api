import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import {
  renderRefundSucceededEmail,
  resolveRefundSucceededLanguage,
} from '~/domains/order/app/outbound-messages/refund-emails.message';
import { formatOutboundMoney } from '~/platform/localization/outbound-messages/format-outbound-money';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { AppJobPayloadMap } from '~/platform/jobs/app-job.types';

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
    const language = resolveRefundSucceededLanguage(order.language);

    const rendered = renderRefundSucceededEmail(language, {
      orderPublicId: order.publicId,
      shopName: order.shop.shopName,
      refundAmount: formatOutboundMoney(language, refundAmount, order.currency),
    });

    await this.mailSender.send({
      to: { email: order.customerEmail },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      tags: ['order-refund-succeeded'],
    });

    this.logger.log(`Processed refund succeeded email for order ${order.id}`);
  }
}
