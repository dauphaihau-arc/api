import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { NotifyUserUseCase } from '~/domains/notification/app/use-cases/notify-user/notify-user.use-case';
import type { NotificationChannel } from '~/domains/notification/app/notification.types';
import {
  SHIPMENT_CARRIER_EVENT_ACCEPTED_EVENT,
  type ShipmentCarrierEventAcceptedPayload,
} from '../../fulfillment/app/events/shipment-carrier-event-accepted.event';
import { CarrierEventCode } from '../../fulfillment/domain/carrier-event';
import { ORDER_UPDATED_SSE_EVENT } from '../app/events/order-sse.event';
import { getRequiredOrderNumber } from '../app/order-number';
import { OrderEntity } from '../infra/persistence/entities/order.entity';

const NOTIFIABLE_CARRIER_EVENTS = [
  CarrierEventCode.PICKED_UP,
  CarrierEventCode.DELIVERED,
] as const;

type NotifiableCarrierEvent = (typeof NOTIFIABLE_CARRIER_EVENTS)[number];

const SHIPMENT_UPDATE_COPY: Readonly<
  Record<NotifiableCarrierEvent, { title: string; body: (orderNumber: string) => string }>
> = {
  [CarrierEventCode.PICKED_UP]: {
    title: 'Order on the way',
    body: orderNumber => `Order ${orderNumber} was picked up by the carrier.`,
  },
  [CarrierEventCode.DELIVERED]: {
    title: 'Order delivered',
    body: orderNumber => `Order ${orderNumber} was delivered.`,
  },
};

/**
 * A carrier handover or delivery concerns both parties: the buyer waiting for
 * the parcel and the seller answering "has it shipped?". Each receives one
 * shipment-update notification and a live event so an open order page refetches.
 */
@Injectable()
export class NotifyShipmentUpdateListener {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly notifyUserUseCase: NotifyUserUseCase,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(SHIPMENT_CARRIER_EVENT_ACCEPTED_EVENT, { suppressErrors: true })
  async handle(payload: ShipmentCarrierEventAcceptedPayload): Promise<void> {
    const order = await this.entityManager.fork().findOne(
      OrderEntity,
      { id: payload.orderId },
      { populate: ['user', 'shop', 'shop.ownerUser'] },
    );

    if (!order) {
      return;
    }

    const recipientUserIds = new Set(
      [order.user?.id, order.shop.ownerUser?.id].filter(
        (userId): userId is string => Boolean(userId),
      ),
    );

    // Every accepted scan refreshes both open order pages, even when it is not
    // worth a push notification.
    for (const userId of recipientUserIds) {
      this.eventEmitter.emit(ORDER_UPDATED_SSE_EVENT, {
        userId,
        orderId: order.publicId,
        changed: ['fulfillment'],
        occurredAt: payload.occurredAt.toISOString(),
      });
    }

    if (!isNotifiableCarrierEvent(payload.eventCode)) {
      return;
    }

    const copy = SHIPMENT_UPDATE_COPY[payload.eventCode];
    const trackingNumber = payload.trackingNumber.trim();

    const notification = {
      type: 'order.shipment.updated',
      title: copy.title,
      body: copy.body(getRequiredOrderNumber(order)),
      data: {
        orderId: order.publicId,
        shopId: order.shop.publicId,
        eventCode: payload.eventCode,
        ...(trackingNumber ? { trackingNumber } : {}),
      },
      channels: ['in_app', 'web_push'] as NotificationChannel[],
    };

    for (const userId of recipientUserIds) {
      await this.notifyUserUseCase.execute({ userId, ...notification });
    }
  }
}

function isNotifiableCarrierEvent(
  code: CarrierEventCode,
): code is NotifiableCarrierEvent {
  return (NOTIFIABLE_CARRIER_EVENTS as readonly CarrierEventCode[]).includes(code);
}