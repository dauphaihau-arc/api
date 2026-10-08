import { Controller, Param, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { ProductLookupService } from '../../../app/services/product-lookup.service';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Observable } from 'rxjs';
import { SsePublisher } from '~/platform/sse/infra/sse.publisher';
import { buildProductInventoryChannelKey } from '../../../app/events/product-inventory-sse.event';

@Controller('products/:product_id/inventory')
@ApiTags('Product Inventory')
export class ProductInventoryEventsController {
  constructor(
    private readonly ssePublisher: SsePublisher,
    private readonly productLookupService: ProductLookupService,
  ) {}

  @Sse('events')
  @ApiOperation({ summary: 'Stream product inventory events over SSE' })
  @ApiParam({ name: 'product_id', type: String })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'Server-sent event stream.',
    schema: { type: 'string' },
  })
  async stream(
    @Param('product_id') productPublicId: string,
  ): Promise<Observable<MessageEvent>> {
    const productId = await this.productLookupService.resolveProductPublicId(productPublicId);

    return this.ssePublisher.createChannelStream(
      buildProductInventoryChannelKey(productId),
      { productId: productPublicId },
    );
  }
}
