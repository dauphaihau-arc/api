import type { OrderCreatedInventoryEvent } from '../events/order-created-inventory.event';

export abstract class OrderInventoryEventPublisher {
  abstract publish(event: OrderCreatedInventoryEvent): Promise<void>;
}
