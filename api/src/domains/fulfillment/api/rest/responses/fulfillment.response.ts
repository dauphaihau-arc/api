import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FulfillmentAggregateStatus } from '../../../domain/enums/fulfillment-aggregate-status.enum';
import { FulfillmentMethod } from '../../../domain/enums/fulfillment-method.enum';
import { FulfillmentOperator } from '../../../domain/enums/fulfillment-operator.enum';
import { FulfillmentProvenance } from '../../../domain/enums/fulfillment-provenance.enum';
import { ShipmentStatus } from '../../../domain/enums/shipment-status.enum';
import { ShipmentUpdateActorType } from '../../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../../domain/enums/shipment-update-source.enum';
import type { FulfillmentProgressSnapshot } from '../../../domain/fulfillment-progress';
import type {
  FulfillmentOrderView,
  FulfillmentShipmentView,
} from '../../../app/fulfillment.types';
import type { OrderLegacyShippingEvidence } from '../../../app/ports/order-fulfillment-context.port';

export class FulfillmentProgressResponseDto {
  @ApiProperty()
  ordered!: number;

  @ApiProperty()
  prepared!: number;

  @ApiProperty()
  dispatched!: number;

  @ApiProperty()
  delivered!: number;

  @ApiProperty()
  canceled!: number;

  @ApiProperty()
  outstanding!: number;
}

export class FulfillmentShipmentItemResponseDto {
  @ApiProperty()
  order_item_id!: string;

  @ApiProperty()
  quantity!: number;
}

export class FulfillmentShipmentUpdateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ShipmentStatus })
  status!: ShipmentStatus;

  @ApiProperty({ enum: ShipmentUpdateActorType })
  actor_type!: ShipmentUpdateActorType;

  @ApiProperty({ type: String, required: false })
  actor_id?: string;

  @ApiProperty({ enum: ShipmentUpdateSource })
  source!: ShipmentUpdateSource;

  @ApiProperty({ type: String, format: 'date-time' })
  occurred_at!: Date;

  @ApiProperty({ type: String, required: false })
  note?: string;
}

export class FulfillmentShipmentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  group_id!: string;

  @ApiProperty({ enum: ShipmentStatus })
  status!: ShipmentStatus;

  @ApiProperty({ type: String, required: false })
  carrier?: string;

  @ApiProperty({ type: String, required: false })
  tracking_number?: string;

  @ApiProperty({ type: String, required: false })
  shipment_note?: string;

  @ApiProperty({ type: [String] })
  origin_countries!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  prepared_at!: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  dispatched_at?: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  delivered_at?: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  voided_at?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;

  @ApiProperty({ type: [FulfillmentShipmentItemResponseDto] })
  @Type(() => FulfillmentShipmentItemResponseDto)
  items!: FulfillmentShipmentItemResponseDto[];

  @ApiProperty({ type: [FulfillmentShipmentUpdateResponseDto] })
  @Type(() => FulfillmentShipmentUpdateResponseDto)
  updates!: FulfillmentShipmentUpdateResponseDto[];
}

export class FulfillmentGroupResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: FulfillmentMethod })
  method!: FulfillmentMethod;

  @ApiProperty({ enum: FulfillmentOperator })
  operator!: FulfillmentOperator;

  @ApiProperty({ enum: FulfillmentProvenance })
  provenance!: FulfillmentProvenance;

  @ApiProperty({ type: [FulfillmentShipmentItemResponseDto] })
  @Type(() => FulfillmentShipmentItemResponseDto)
  items!: FulfillmentShipmentItemResponseDto[];

  @ApiProperty({ type: FulfillmentProgressResponseDto })
  @Type(() => FulfillmentProgressResponseDto)
  progress!: FulfillmentProgressResponseDto;

  @ApiProperty({ type: [FulfillmentShipmentResponseDto] })
  @Type(() => FulfillmentShipmentResponseDto)
  shipments!: FulfillmentShipmentResponseDto[];
}

export class FulfillmentLegacyShippingResponseDto {
  @ApiProperty()
  status!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at!: Date;

  @ApiProperty()
  to_country!: string;

  @ApiProperty({ type: [String] })
  from_countries!: string[];

  @ApiProperty({ type: String, format: 'date-time', required: false })
  estimated_delivery?: Date;

  @ApiProperty({ type: String, required: false })
  tracking_number?: string;

  @ApiProperty({ type: String, required: false })
  carrier?: string;

  @ApiProperty({ type: String, required: false })
  note?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  shipped_at?: Date;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  delivered_at?: Date;
}

export class FulfillmentOrderResponseDto {
  @ApiProperty({ enum: FulfillmentAggregateStatus })
  status!: FulfillmentAggregateStatus;

  @ApiProperty()
  requires_reconciliation!: boolean;

  @ApiProperty({ type: FulfillmentProgressResponseDto })
  @Type(() => FulfillmentProgressResponseDto)
  progress!: FulfillmentProgressResponseDto;

  @ApiProperty({ type: FulfillmentLegacyShippingResponseDto })
  @Type(() => FulfillmentLegacyShippingResponseDto)
  legacy_shipping!: FulfillmentLegacyShippingResponseDto;

  @ApiProperty({ type: [FulfillmentGroupResponseDto] })
  @Type(() => FulfillmentGroupResponseDto)
  groups!: FulfillmentGroupResponseDto[];
}

export class ShopOrderFulfillmentResponseDto {
  @ApiProperty({ type: FulfillmentOrderResponseDto })
  @Type(() => FulfillmentOrderResponseDto)
  fulfillment!: FulfillmentOrderResponseDto;
}

function serializeProgress(progress: FulfillmentProgressSnapshot) {
  return {
    ordered: progress.ordered,
    prepared: progress.prepared,
    dispatched: progress.dispatched,
    delivered: progress.delivered,
    canceled: progress.canceled,
    outstanding: progress.outstanding,
  };
}

function serializeShipment(shipment: FulfillmentShipmentView) {
  return {
    id: shipment.publicId,
    group_id: shipment.groupId,
    status: shipment.status,
    carrier: shipment.carrier,
    tracking_number: shipment.trackingNumber,
    shipment_note: shipment.note,
    origin_countries: shipment.originCountries,
    prepared_at: shipment.preparedAt,
    dispatched_at: shipment.dispatchedAt,
    delivered_at: shipment.deliveredAt,
    voided_at: shipment.voidedAt,
    created_at: shipment.createdAt,
    updated_at: shipment.updatedAt,
    items: shipment.items.map((item) => ({
      order_item_id: item.orderItemId,
      quantity: item.quantity,
    })),
    updates: shipment.updates.map((update) => ({
      id: update.id,
      status: update.status,
      actor_type: update.actorType,
      actor_id: update.actorId,
      source: update.source,
      occurred_at: update.occurredAt,
      note: update.note,
    })),
  };
}

export function toFulfillmentOrderResponse(input: {
  view: FulfillmentOrderView;
  status: FulfillmentAggregateStatus;
  requiresReconciliation: boolean;
  legacyShipping: OrderLegacyShippingEvidence;
}) {
  return {
    status: input.status,
    requires_reconciliation: input.requiresReconciliation,
    progress: serializeProgress(input.view.progress),
    legacy_shipping: {
      status: input.legacyShipping.status,
      updated_at: input.legacyShipping.updatedAt,
      to_country: input.legacyShipping.toCountry,
      from_countries: input.legacyShipping.fromCountries,
      estimated_delivery: input.legacyShipping.estimatedDelivery,
      tracking_number: input.legacyShipping.trackingNumber,
      carrier: input.legacyShipping.carrier,
      note: input.legacyShipping.note,
      shipped_at: input.legacyShipping.shippedAt,
      delivered_at: input.legacyShipping.deliveredAt,
    },
    groups: input.view.groups.map((group) => ({
      id: group.id,
      method: group.method,
      operator: group.operator,
      provenance: group.provenance,
      items: group.items.map((item) => ({
        order_item_id: item.orderItemId,
        quantity: item.quantity,
      })),
      progress: serializeProgress(group.progress),
      shipments: group.shipments.map(serializeShipment),
    })),
  };
}
