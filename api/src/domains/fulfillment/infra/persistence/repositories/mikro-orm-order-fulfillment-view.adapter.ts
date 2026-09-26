import type { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import {
  loadOrderFulfillmentViews,
  type LoadOrderFulfillmentOptions,
} from '../../../app/fulfillment-view.loader';
import { OrderFulfillmentViewPort } from '../../../app/ports/order-fulfillment-view.port';
import type { FulfillmentOrderView } from '../../../app/fulfillment.types';

/**
 * Adapter that keeps Fulfillment's persistence-backed loader private while other
 * domains read fulfillment views through OrderFulfillmentViewPort.
 */
@Injectable()
export class MikroOrmOrderFulfillmentViewAdapter implements OrderFulfillmentViewPort {
  load(
    entityManager: EntityManager,
    orderIds: string[],
    options: LoadOrderFulfillmentOptions = {},
  ): Promise<Map<string, FulfillmentOrderView>> {
    return loadOrderFulfillmentViews(entityManager, orderIds, options);
  }
}
