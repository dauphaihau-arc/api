import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { OrderEntity } from '~/domains/order/infra/persistence/entities/order.entity';
import { MailSender } from '~/integrations/mail/app/ports/mail-sender';
import type { AppJobPayloadMap } from '~/integrations/queue/app/app-job.types';

type SendSellerOrderUpdateEmailPayload =
  AppJobPayloadMap['order.send-seller-order-update-email'];

@Injectable()
export class SendSellerOrderUpdateEmailJob {
  private readonly logger = new Logger(SendSellerOrderUpdateEmailJob.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly mailSender: MailSender,
  ) {}

  async run(payload: SendSellerOrderUpdateEmailPayload): Promise<void> {
    const entityManager = this.entityManager.fork();
    const order = await entityManager.getRepository(OrderEntity).findOne(
      { id: payload.orderId },
      { populate: ['shop', 'shop.ownerUser'] },
    );

    const sellerEmail = order?.shop.ownerUser?.email;
    if (!order || !sellerEmail) {
      return;
    }

    const subject = payload.eventType === 'canceled'
      ? `Order ${order.id} was canceled`
      : `Order ${order.id} was refunded`;
    const body = payload.eventType === 'canceled'
      ? `Order ${order.id} from ${order.customerEmail} was canceled.`
      : `Order ${order.id} from ${order.customerEmail} was refunded.`;

    await this.mailSender.send({
      to: {
        email: sellerEmail,
        name: order.shop.ownerUser.displayName ?? order.shop.shopName,
      },
      subject,
      text: `${body} Shop: ${order.shop.shopName}.`,
      html: `<p>${body}</p><p>Shop: ${order.shop.shopName}</p>`,
      tags: [`order-${payload.eventType}`, 'seller-order-update'],
    });

    this.logger.log(
      `Processed seller ${payload.eventType} email for order ${order.id}`,
    );
  }
}
