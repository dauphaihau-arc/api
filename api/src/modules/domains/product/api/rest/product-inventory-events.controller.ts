import { Controller, Param, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { SsePublisher } from '~/modules/shared/sse/infra/sse.publisher';
import { buildProductInventoryChannelKey } from '../../app/events/product-inventory-sse.event';

@Controller('products/:productId/inventory')
export class ProductInventoryEventsController {
  constructor(private readonly ssePublisher: SsePublisher) {}

  @Sse('events')
  stream(
    @Param('productId') productId: string
  ): Observable<MessageEvent> {
    return this.ssePublisher.createChannelStream(
      buildProductInventoryChannelKey(productId),
      { productId }
    );
  }
}
