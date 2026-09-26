import { Injectable } from '@nestjs/common';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import { OrderStatus } from '~/domains/order/domain/enums/order-status.enum';
import {
  FulfillmentReconciliationIncompleteError,
  OrderNotEligibleForFulfillmentError,
} from '../../errors/fulfillment-app.error';
import {
  FulfillmentCommandRunner,
  RECONCILABLE_ORDER_STATUSES,
} from '../../services/fulfillment-command.runner';
import { FulfillmentService } from '../../services/fulfillment.service';

export type ReconcileOrderFulfillmentCommand = {
  items: Array<{ orderItemId: string; quantity: number }>;
};

/**
 * Attests the remaining fulfillment quantities of a legacy Order. Every order
 * item must be attested at exactly its full remaining obligation, so a partially
 * attested order can never complete commercially while units remain unaccounted.
 */
@Injectable()
export class ReconcileOrderFulfillmentUseCase {
  constructor(
    private readonly commandRunner: FulfillmentCommandRunner,
    private readonly fulfillmentService: FulfillmentService,
  ) {}

  async execute(
    shopId: string,
    orderId: string,
    actorId: string,
    input: ReconcileOrderFulfillmentCommand,
  ) {
    return this.commandRunner.execute(shopId, orderId, async (context, entityManager) => {
      if (!RECONCILABLE_ORDER_STATUSES.has(context.status as OrderStatus)) {
        throw new OrderNotEligibleForFulfillmentError();
      }

      assertCompleteAttestation(context.items, input.items);

      await this.fulfillmentService.reconcileLegacyOrder(entityManager, {
        orderId: context.id,
        shopId: context.shopId,
        items: input.items,
        actor: {
          actorType: ShipmentUpdateActorType.SELLER,
          actorId,
          source: ShipmentUpdateSource.LEGACY_RECONCILIATION,
        },
      });
    });
  }
}

function assertCompleteAttestation(
  orderedItems: Array<{ orderItemId: string; quantity: number }>,
  attestedItems: Array<{ orderItemId: string; quantity: number }>,
): void {
  const attestedByItemId = new Map(
    attestedItems.map((item) => [item.orderItemId, item.quantity]),
  );

  if (attestedByItemId.size !== attestedItems.length) {
    throw new FulfillmentReconciliationIncompleteError();
  }

  const coversEveryOrderItem = orderedItems.every((orderItem) =>
    attestedByItemId.get(orderItem.orderItemId) === orderItem.quantity);

  if (!coversEveryOrderItem || attestedByItemId.size !== orderedItems.length) {
    throw new FulfillmentReconciliationIncompleteError();
  }
}
