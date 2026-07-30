import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { buildUserEventsChannelKey } from '~/platform/sse/app/user-events-channel';
import { SsePublisher } from '~/platform/sse/infra/sse.publisher';
import {
  ORDER_UPDATED_SSE_EVENT,
  type OrderUpdatedSseEventPayload,
} from '../app/events/order-sse.event';

@Injectable()
export class ForwardOrderUpdatedToSseListener {
  constructor(private readonly ssePublisher: SsePublisher) {}

  @OnEvent(ORDER_UPDATED_SSE_EVENT, { async: true, suppressErrors: true })
  handle(payload: OrderUpdatedSseEventPayload): void {
    this.ssePublisher.publish(buildUserEventsChannelKey(payload.userId), {
      id: randomUUID(),
      type: 'message',
      data: {
        eventType: 'order.updated',
        orderId: payload.orderId,
        changed: payload.changed,
        ...(payload.status ? { status: payload.status } : {}),
        ...(payload.shippingStatus ? { shippingStatus: payload.shippingStatus } : {}),
        occurredAt: payload.occurredAt ?? new Date().toISOString(),
      },
    });
  }
}
