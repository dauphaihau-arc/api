import type { FulfillmentMethod } from '../domain/enums/fulfillment-method.enum';
import type { FulfillmentOperator } from '../domain/enums/fulfillment-operator.enum';
import type { FulfillmentProvenance } from '../domain/enums/fulfillment-provenance.enum';
import type { ShipmentStatus } from '../domain/enums/shipment-status.enum';
import type { ShipmentUpdateActorType } from '../domain/enums/shipment-update-actor-type.enum';
import type { ShipmentUpdateSource } from '../domain/enums/shipment-update-source.enum';
import type { FulfillmentProgressSnapshot } from '../domain/fulfillment-progress';

export type FulfillmentActor = {
  actorType: ShipmentUpdateActorType;
  actorId?: string;
  source: ShipmentUpdateSource;
};

export type FulfillmentRequestedItem = {
  orderItemId: string;
  quantity: number;
};

export interface FulfillmentGroupItemView {
  orderItemId: string;
  quantity: number;
}

export interface FulfillmentShipmentUpdateView {
  id: string;
  status: ShipmentStatus;
  actorType: ShipmentUpdateActorType;
  actorId?: string;
  source: ShipmentUpdateSource;
  occurredAt: Date;
  note?: string;
}

export interface FulfillmentShipmentView {
  id: string;
  publicId: string;
  groupId: string;
  status: ShipmentStatus;
  carrier?: string;
  trackingNumber?: string;
  note?: string;
  originCountries: string[];
  preparedAt: Date;
  dispatchedAt?: Date;
  deliveredAt?: Date;
  voidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  items: FulfillmentGroupItemView[];
  updates: FulfillmentShipmentUpdateView[];
}

export interface FulfillmentGroupView {
  id: string;
  method: FulfillmentMethod;
  operator: FulfillmentOperator;
  provenance: FulfillmentProvenance;
  items: FulfillmentGroupItemView[];
  shipments: FulfillmentShipmentView[];
  progress: FulfillmentProgressSnapshot;
}

export interface FulfillmentOrderView {
  groups: FulfillmentGroupView[];
  progress: FulfillmentProgressSnapshot;
  hasInTransit: boolean;
}

export function emptyFulfillmentOrderView(): FulfillmentOrderView {
  return {
    groups: [],
    progress: {
      ordered: 0,
      prepared: 0,
      dispatched: 0,
      delivered: 0,
      canceled: 0,
      outstanding: 0,
    },
    hasInTransit: false,
  };
}
