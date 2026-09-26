import type { EntityManager } from '@mikro-orm/postgresql';
import type { FulfillmentOrderView } from '../fulfillment.types';

export type LoadOrderFulfillmentViewsOptions = {
  /**
   * Orders whose commercial cancellation is confirmed. Cancellation is a
   * whole-Order fact in this release, so every assigned unit is reported as
   * canceled and the remaining obligation reaches zero.
   */
  canceledOrderIds?: Iterable<string>;
};

/**
 * Fulfillment's public read contract for Order, Checkout, and admin surfaces.
 * Consumers load collection-shaped fulfillment views through this port instead of
 * reaching into Fulfillment's persistence-backed loader.
 */
export abstract class OrderFulfillmentViewPort {
  abstract load(
    entityManager: EntityManager,
    orderIds: string[],
    options?: LoadOrderFulfillmentViewsOptions,
  ): Promise<Map<string, FulfillmentOrderView>>;
}
