import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  SSE_ORDER_UPDATED_EVENT,
  type OrderUpdatedSseEventPayload,
} from '../app/sse.events';
import { SsePublisher } from '../infra/sse.publisher';

@Injectable()
export class ForwardOrderUpdatedToSseListener {
  constructor(private readonly ssePublisher: SsePublisher) {}

  @OnEvent(SSE_ORDER_UPDATED_EVENT, { async: true, suppressErrors: true })
  handle(payload: OrderUpdatedSseEventPayload): void {
    this.ssePublisher.publishToUser(payload.userId, {
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
