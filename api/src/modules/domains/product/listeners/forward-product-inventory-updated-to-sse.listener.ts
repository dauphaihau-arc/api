import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SsePublisher } from '~/modules/shared/sse/infra/sse.publisher';
import {
  buildProductInventoryChannelKey,
  PRODUCT_INVENTORY_UPDATED_SSE_EVENT,
  type ProductInventoryUpdatedSseEventPayload,
} from '../app/events/product-inventory-sse.event';

@Injectable()
export class ForwardProductInventoryUpdatedToSseListener {
  constructor(private readonly ssePublisher: SsePublisher) {}

  @OnEvent(PRODUCT_INVENTORY_UPDATED_SSE_EVENT, { async: true, suppressErrors: true })
  handle(payload: ProductInventoryUpdatedSseEventPayload): void {
    this.ssePublisher.publish(buildProductInventoryChannelKey(payload.productId), {
      id: randomUUID(),
      type: 'message',
      data: {
        eventType: 'product.inventory.updated',
        productId: payload.productId,
        inventoryId: payload.inventoryId,
        stock: payload.stock,
        status: payload.status,
        occurredAt: payload.occurredAt ?? new Date().toISOString(),
      },
    });
  }
}
