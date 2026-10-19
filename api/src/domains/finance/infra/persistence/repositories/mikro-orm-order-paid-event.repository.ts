import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { OutboxEventEntity } from '~/platform/outbox/outbox-event.entity';
import { ORDER_PAID_MONEY_EVENT_NAME } from '../../../app/ports/order-paid-money-event';
import {
  OrderPaidEventRepository,
  type OrderPaidEventStatus,
} from '../../../app/ports/order-paid-event.repository';

@Injectable()
export class MikroOrmOrderPaidEventRepository
implements OrderPaidEventRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findStatusByOrderId(
    orderId: string,
  ): Promise<OrderPaidEventStatus | null> {
    const event = await this.entityManager.fork().findOne(OutboxEventEntity, {
      eventName: ORDER_PAID_MONEY_EVENT_NAME,
      aggregateId: orderId,
    }, {
      orderBy: { createdAt: 'desc' },
    });

    // The stored statuses are the port's own values; cast rather than couple the
    // application layer to the outbox enum.
    return event ? (String(event.status) as OrderPaidEventStatus) : null;
  }
}
