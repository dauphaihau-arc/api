import type { EntityManager } from '@mikro-orm/postgresql';
import {
  computeFulfillmentProgress,
  type ShipmentQuantityState,
} from '../domain/fulfillment-progress';
import type {
  FulfillmentGroupItemView,
  FulfillmentGroupView,
  FulfillmentOrderView,
  FulfillmentShipmentUpdateView,
  FulfillmentShipmentView,
} from './fulfillment.types';
import { FulfillmentGroupEntity } from '../infra/persistence/entities/fulfillment-group.entity';
import { ShipmentStatus } from '../domain/enums/shipment-status.enum';

const GROUP_POPULATE = [
  'items',
  'shipments',
  'shipments.items',
  'shipments.updates',
] as const;

export type LoadOrderFulfillmentOptions = {
  canceledOrderIds?: Iterable<string>;
};

export async function loadOrderFulfillmentViews(
  entityManager: EntityManager,
  orderIds: string[],
  options: LoadOrderFulfillmentOptions = {},
): Promise<Map<string, FulfillmentOrderView>> {
  const result = new Map<string, FulfillmentOrderView>();
  if (orderIds.length === 0) return result;

  const canceledOrderIds = new Set(options.canceledOrderIds ?? []);
  const groups = await entityManager.getRepository(FulfillmentGroupEntity).find(
    { orderId: { $in: orderIds } },
    { populate: [...GROUP_POPULATE], orderBy: { createdAt: 'asc' } },
  );
  const groupsByOrderId = new Map<string, FulfillmentGroupEntity[]>();

  for (const group of groups) {
    const existing = groupsByOrderId.get(group.orderId) ?? [];
    existing.push(group);
    groupsByOrderId.set(group.orderId, existing);
  }

  for (const orderId of orderIds) {
    const orderGroups = groupsByOrderId.get(orderId) ?? [];
    const isCanceled = canceledOrderIds.has(orderId);
    const groupViews = orderGroups.map((group) => toGroupView(group, isCanceled));
    const shipmentStates: ShipmentQuantityState[] = orderGroups.flatMap((group) =>
      group.shipments.getItems().map((shipment) => ({
        status: shipment.status,
        items: shipment.items.getItems().map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      })));
    const orderedQuantity = groupViews.reduce(
      (total, group) => total + sumOrderedQuantity(group.items),
      0,
    );

    result.set(orderId, {
      groups: groupViews,
      progress: computeFulfillmentProgress(
        orderedQuantity,
        shipmentStates,
        isCanceled ? orderedQuantity : 0,
      ),
      hasInTransit: orderGroups.some((group) =>
        group.shipments.getItems().some(
          (shipment) => shipment.status === ShipmentStatus.IN_TRANSIT,
        )),
    });
  }

  return result;
}

function sumOrderedQuantity(items: FulfillmentGroupItemView[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}

function toGroupView(
  group: FulfillmentGroupEntity,
  isCanceled: boolean,
): FulfillmentGroupView {
  const items: FulfillmentGroupItemView[] = group.items.getItems().map((item) => ({
    orderItemId: item.orderItemId,
    quantity: item.quantity,
  }));

  const shipments: FulfillmentShipmentView[] = group.shipments.getItems()
    .slice()
    .sort((left, right) => {
      const difference = left.preparedAt.getTime() - right.preparedAt.getTime();
      return difference !== 0 ? difference : left.id.localeCompare(right.id);
    })
    .map((shipment): FulfillmentShipmentView => ({
      id: shipment.id,
      publicId: shipment.publicId,
      groupId: group.id,
      status: shipment.status,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
      note: shipment.note,
      originCountries: shipment.originCountries,
      preparedAt: shipment.preparedAt,
      dispatchedAt: shipment.dispatchedAt,
      deliveredAt: shipment.deliveredAt,
      voidedAt: shipment.voidedAt,
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
      items: shipment.items.getItems().map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
      })),
      updates: shipment.updates.getItems()
        .slice()
        .sort((left, right) => {
          const difference = left.occurredAt.getTime() - right.occurredAt.getTime();
          return difference !== 0 ? difference : left.id.localeCompare(right.id);
        })
        .map((update): FulfillmentShipmentUpdateView => ({
          id: update.id,
          status: update.status,
          actorType: update.actorType,
          actorId: update.actorId,
          source: update.source,
          occurredAt: update.occurredAt,
          note: update.note,
        })),
    }));

  const orderedQuantity = sumOrderedQuantity(items);
  return {
    id: group.id,
    method: group.method,
    operator: group.operator,
    provenance: group.provenance,
    items,
    shipments,
    progress: computeFulfillmentProgress(
      orderedQuantity,
      shipments.map((shipment) => ({ status: shipment.status, items: shipment.items })),
      isCanceled ? orderedQuantity : 0,
    ),
  };
}
