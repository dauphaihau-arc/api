import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { FulfillmentMethod } from '../../domain/enums/fulfillment-method.enum';
import { FulfillmentOperator } from '../../domain/enums/fulfillment-operator.enum';
import { FulfillmentProvenance } from '../../domain/enums/fulfillment-provenance.enum';
import { ShipmentStatus } from '../../domain/enums/shipment-status.enum';
import {
  isDispatchStatus,
  isJourneyTransitionAllowed,
} from '../../domain/shipment-journey';
import { loadOrderFulfillmentViews } from '../fulfillment-view.loader';
import type { LoadOrderFulfillmentOptions } from '../fulfillment-view.loader';
import { FulfillmentGroupEntity } from '../../infra/persistence/entities/fulfillment-group.entity';
import { FulfillmentGroupItemEntity } from '../../infra/persistence/entities/fulfillment-group-item.entity';
import { ShipmentEntity } from '../../infra/persistence/entities/shipment.entity';
import { ShipmentItemEntity } from '../../infra/persistence/entities/shipment-item.entity';
import { ShipmentUpdateEntity } from '../../infra/persistence/entities/shipment-update.entity';
import {
  FulfillmentGroupAlreadyAssignedError,
  FulfillmentGroupNotFoundError,
  FulfillmentGroupSelectionRequiredError,
  FulfillmentReconciliationRequiredError,
  ShipmentNotFoundError,
} from '../errors/fulfillment-app.error';
import {
  InvalidFulfillmentQuantityError,
  InvalidShipmentJourneyTransitionError,
  ShipmentAlreadyVoidedError,
  ShipmentItemNotInGroupError,
  ShipmentNotPreparedError,
  ShipmentQuantityExceededError,
  UnsupportedFulfillmentMethodError,
} from '../../domain/errors/fulfillment-domain.error';
const GROUP_POPULATE = [
  'items',
  'shipments',
  'shipments.items',
  'shipments.updates',
] as const;

import type {
  FulfillmentActor,
  FulfillmentOrderView,
  FulfillmentRequestedItem,
} from '../fulfillment.types';

export type AssignOrderFulfillmentInput = {
  orderId: string;
  shopId: string;
  items: FulfillmentRequestedItem[];
  actor: FulfillmentActor;
};

export type PrepareShipmentInput = {
  orderId: string;
  shopId: string;
  groupId?: string;
  items?: FulfillmentRequestedItem[];
  carrier?: string;
  trackingNumber?: string;
  note?: string;
  originCountries: string[];
  actor: FulfillmentActor;
};

export type AmendShipmentInput = {
  orderId: string;
  shopId: string;
  shipmentId: string;
  items?: FulfillmentRequestedItem[];
  carrier?: string;
  trackingNumber?: string;
  note?: string;
  actor: FulfillmentActor;
};

export type RecordJourneyInput = {
  orderId: string;
  shopId: string;
  shipmentId: string;
  status: ShipmentStatus;
  carrier?: string;
  trackingNumber?: string;
  note?: string;
  actor: FulfillmentActor;
  occurredAt?: Date;
};

@Injectable()
export class FulfillmentService {
  /**
   * Assigns the seller group and its exact Order Item quantities to a newly
   * confirmed Order. Replay-safe: an existing group for the order is returned
   * unchanged, so duplicate confirmation cannot create a second assignment.
   */
  async assignSellerGroupToOrder(
    entityManager: EntityManager,
    input: AssignOrderFulfillmentInput,
  ): Promise<FulfillmentGroupEntity> {
    await this.lockOrderAssignment(entityManager, input.orderId);

    const existing = await entityManager.getRepository(FulfillmentGroupEntity).findOne(
      { orderId: input.orderId },
    );

    if (existing) {
      return existing;
    }

    this.assertRequestedItems(input.items);

    // Fulfillment Group Items reference Order Items by scalar identity. Order
    // Items created in this transaction must be inserted before those FKs.
    await entityManager.flush();

    const group = entityManager.create(FulfillmentGroupEntity, {
      orderId: input.orderId,
      shopId: input.shopId,
      method: FulfillmentMethod.SELLER,
      operator: FulfillmentOperator.SELLER,
      provenance: FulfillmentProvenance.CONFIRMED_ORDER,
      createdByActorType: input.actor.actorType,
      createdByActorId: input.actor.actorId,
      createdBySource: input.actor.source,
    });

    entityManager.persist(group);

    for (const item of input.items) {
      entityManager.persist(entityManager.create(FulfillmentGroupItemEntity, {
        group,
        orderItemId: item.orderItemId,
        quantity: item.quantity,
      }));

    }

    await entityManager.flush();

    return group;
  }

  /**
   * Seller reconciliation for a legacy Order with no fulfillment assignment.
   * Records newly attested quantities without consuming stock again or
   * rewriting the immutable legacy order-level shipping evidence.
   */
  async reconcileLegacyOrder(
    entityManager: EntityManager,
    input: AssignOrderFulfillmentInput,
  ): Promise<FulfillmentGroupEntity> {
    await this.lockOrderAssignment(entityManager, input.orderId);

    const existing = await entityManager.getRepository(FulfillmentGroupEntity).findOne(
      { orderId: input.orderId },
    );

    if (existing) {
      throw new FulfillmentGroupAlreadyAssignedError();
    }

    this.assertRequestedItems(input.items);

    const group = entityManager.create(FulfillmentGroupEntity, {
      orderId: input.orderId,
      shopId: input.shopId,
      method: FulfillmentMethod.SELLER,
      operator: FulfillmentOperator.SELLER,
      provenance: FulfillmentProvenance.LEGACY_RECONCILIATION,
      createdByActorType: input.actor.actorType,
      createdByActorId: input.actor.actorId,
      createdBySource: input.actor.source,
    });

    entityManager.persist(group);

    for (const item of input.items) {
      entityManager.persist(entityManager.create(FulfillmentGroupItemEntity, {
        group,
        orderItemId: item.orderItemId,
        quantity: item.quantity,
      }));
    }

    await entityManager.flush();

    return group;
  }

  async prepareShipment(
    entityManager: EntityManager,
    input: PrepareShipmentInput,
  ): Promise<ShipmentEntity> {
    const group = await this.loadGroupForWrite(entityManager, input.orderId, input.groupId);
    this.assertSellerGroup(group);
    this.assertRequestedItems(input.items ?? []);

    const groupItems = group.items.getItems();
    const requestedItems = this.resolveRequestedItems(input.items, groupItems);
    this.assertItemsWithinGroup(requestedItems, groupItems);

    const usedQuantities = this.sumActiveShipmentQuantities(group);
    this.assertQuantityAvailable(requestedItems, groupItems, usedQuantities);

    // A new Shipment records the Order's origin countries; the address snapshot
    // is immutable historical evidence on older Shipments and is never rewritten.
    const shipment = entityManager.create(ShipmentEntity, {
      group,
      orderId: group.orderId,
      shopId: group.shopId,
      status: ShipmentStatus.PREPARED,
      carrier: normalizeOptionalText(input.carrier),
      trackingNumber: normalizeOptionalText(input.trackingNumber),
      note: normalizeOptionalText(input.note),
      originCountries: [...input.originCountries],
      preparedAt: new Date(),
    });

    entityManager.persist(shipment);

    for (const item of requestedItems) {
      entityManager.persist(entityManager.create(ShipmentItemEntity, {
        shipment,
        orderItemId: item.orderItemId,
        quantity: item.quantity,
      }));
    }

    entityManager.persist(entityManager.create(ShipmentUpdateEntity, {
      shipment,
      status: ShipmentStatus.PREPARED,
      actorType: input.actor.actorType,
      actorId: input.actor.actorId,
      source: input.actor.source,
      occurredAt: shipment.preparedAt,
      note: shipment.note,
    }));

    await entityManager.flush();

    return shipment;
  }

  async amendShipment(
    entityManager: EntityManager,
    input: AmendShipmentInput,
  ): Promise<ShipmentEntity> {
    const shipment = await this.loadShipmentForWrite(
      entityManager,
      input.orderId,
      input.shipmentId,
    );

    if (shipment.status === ShipmentStatus.VOIDED) {
      throw new ShipmentAlreadyVoidedError();
    }

    if (shipment.status !== ShipmentStatus.PREPARED) {
      throw new ShipmentNotPreparedError();
    }

    const group = await this.loadGroupForWrite(entityManager, input.orderId, shipment.group.id);
    const groupItems = group.items.getItems();

    if (input.items !== undefined) {
      this.assertRequestedItems(input.items);
      const requestedItems = this.resolveRequestedItems(input.items, groupItems);
      this.assertItemsWithinGroup(requestedItems, groupItems);

      const usedQuantities = this.sumActiveShipmentQuantities(group, shipment.id);
      this.assertQuantityAvailable(requestedItems, groupItems, usedQuantities);

      for (const existingItem of shipment.items.getItems()) {
        entityManager.remove(existingItem);
      }

      for (const item of requestedItems) {
        entityManager.persist(entityManager.create(ShipmentItemEntity, {
          shipment,
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        }));
      }
    }

    if (input.carrier !== undefined) {
      shipment.carrier = normalizeOptionalText(input.carrier);
    }

    if (input.trackingNumber !== undefined) {
      shipment.trackingNumber = normalizeOptionalText(input.trackingNumber);
    }

    if (input.note !== undefined) {
      shipment.note = normalizeOptionalText(input.note);
    }

    entityManager.persist(entityManager.create(ShipmentUpdateEntity, {
      shipment,
      status: ShipmentStatus.PREPARED,
      actorType: input.actor.actorType,
      actorId: input.actor.actorId,
      source: input.actor.source,
      occurredAt: new Date(),
      payload: { amended: true },
    }));

    await entityManager.flush();

    return shipment;
  }

  async voidShipment(
    entityManager: EntityManager,
    input: {
      orderId: string; shopId: string; shipmentId: string; actor: FulfillmentActor 
    },
  ): Promise<void> {
    const shipment = await this.loadShipmentForWrite(
      entityManager,
      input.orderId,
      input.shipmentId,
    );

    if (shipment.status === ShipmentStatus.VOIDED) {
      throw new ShipmentAlreadyVoidedError();
    }

    if (shipment.status !== ShipmentStatus.PREPARED) {
      throw new ShipmentNotPreparedError();
    }

    shipment.status = ShipmentStatus.VOIDED;
    shipment.voidedAt = new Date();

    entityManager.persist(entityManager.create(ShipmentUpdateEntity, {
      shipment,
      status: ShipmentStatus.VOIDED,
      actorType: input.actor.actorType,
      actorId: input.actor.actorId,
      source: input.actor.source,
      occurredAt: shipment.voidedAt,
    }));

    await entityManager.flush();
  }

  /**
   * Records the Shipment journey. An unchanged status is a no-op: replay must not
   * duplicate updates or reset delivered timestamps.
   */
  async recordJourney(
    entityManager: EntityManager,
    input: RecordJourneyInput,
  ): Promise<ShipmentEntity> {
    const shipment = await this.loadShipmentForWrite(
      entityManager,
      input.orderId,
      input.shipmentId,
    );

    if (shipment.status === ShipmentStatus.VOIDED) {
      throw new ShipmentAlreadyVoidedError();
    }

    if (!isJourneyTransitionAllowed(shipment.status, input.status)) {
      throw new InvalidShipmentJourneyTransitionError();
    }

    const statusChanged = shipment.status !== input.status;
    const carrier = input.carrier === undefined
      ? shipment.carrier
      : normalizeOptionalText(input.carrier);
    const trackingNumber = input.trackingNumber === undefined
      ? shipment.trackingNumber
      : normalizeOptionalText(input.trackingNumber);
    const note = input.note === undefined
      ? shipment.note
      : normalizeOptionalText(input.note);

    // Replaying an unchanged command is a no-op: it must not add another Shipment
    // Update or refresh delivered/dispatched timestamps.
    if (
      !statusChanged
      && carrier === shipment.carrier
      && trackingNumber === shipment.trackingNumber
      && note === shipment.note
    ) {
      return shipment;
    }

    const occurredAt = input.occurredAt ?? new Date();
    shipment.status = input.status;
    shipment.carrier = carrier;
    shipment.trackingNumber = trackingNumber;
    shipment.note = note;

    if (statusChanged && input.status === ShipmentStatus.DISPATCHED && !shipment.dispatchedAt) {
      shipment.dispatchedAt = occurredAt;
    }

    if (statusChanged && input.status === ShipmentStatus.DELIVERED && !shipment.deliveredAt) {
      shipment.deliveredAt = occurredAt;
    }

    entityManager.persist(entityManager.create(ShipmentUpdateEntity, {
      shipment,
      status: input.status,
      actorType: input.actor.actorType,
      actorId: input.actor.actorId,
      source: input.actor.source,
      occurredAt,
      note: shipment.note,
      ...(statusChanged ? {} : { payload: { corrected: true } }),
    }));

    await entityManager.flush();

    return shipment;
  }

  async loadOrderFulfillment(
    entityManager: EntityManager,
    orderIds: string[],
    options?: LoadOrderFulfillmentOptions,
  ): Promise<Map<string, FulfillmentOrderView>> {
    return loadOrderFulfillmentViews(entityManager, orderIds, options);
  }

  /**
   * Locks the order's group rows and reports whether any quantity has been handed
   * to a carrier. Cancellation shares this lock so it cannot race a dispatch.
   */
  async getDispatchState(
    entityManager: EntityManager,
    orderId: string,
  ): Promise<{ hasGroups: boolean; hasDispatched: boolean }> {
    const groups = await entityManager.getRepository(FulfillmentGroupEntity).find(
      { orderId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );

    if (groups.length === 0) {
      return { hasGroups: false, hasDispatched: false };
    }

    const shipments = await entityManager.getRepository(ShipmentEntity).find({
      group: { $in: groups.map((group) => group.id) },
    });

    return {
      hasGroups: true,
      hasDispatched: shipments.some((shipment) => isDispatchStatus(shipment.status)),
    };
  }

  /**
   * Voids any preparation that has not been handed to a carrier. Confirmed
   * cancellation removes the canceled obligation without erasing dispatch history.
   */
  async voidUndispatchedShipments(
    entityManager: EntityManager,
    orderId: string,
    actor: FulfillmentActor,
  ): Promise<void> {
    const groups = await entityManager.getRepository(FulfillmentGroupEntity).find(
      { orderId },
    );

    if (groups.length === 0) {
      return;
    }

    const shipments = await entityManager.getRepository(ShipmentEntity).find({
      group: { $in: groups.map((group) => group.id) },
      status: ShipmentStatus.PREPARED,
    });

    const voidedAt = new Date();

    for (const shipment of shipments) {
      shipment.status = ShipmentStatus.VOIDED;
      shipment.voidedAt = voidedAt;

      entityManager.persist(entityManager.create(ShipmentUpdateEntity, {
        shipment,
        status: ShipmentStatus.VOIDED,
        actorType: actor.actorType,
        actorId: actor.actorId,
        source: actor.source,
        occurredAt: voidedAt,
      }));
    }

    if (shipments.length > 0) {
      await entityManager.flush();
    }
  }

  private async loadGroupForWrite(
    entityManager: EntityManager,
    orderId: string,
    groupId?: string,
  ): Promise<FulfillmentGroupEntity> {
    const locked = await entityManager.getRepository(FulfillmentGroupEntity).find(
      groupId ? { id: groupId, orderId } : { orderId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );

    if (locked.length === 0) {
      const anyGroup = await entityManager.getRepository(FulfillmentGroupEntity).findOne(
        { orderId },
      );

      if (!anyGroup) {
        throw new FulfillmentReconciliationRequiredError();
      }

      throw new FulfillmentGroupNotFoundError();
    }

    if (locked.length > 1) {
      throw new FulfillmentGroupSelectionRequiredError();
    }

    const group = await entityManager.getRepository(FulfillmentGroupEntity).findOne(
      { id: locked[0]!.id },
      { populate: [...GROUP_POPULATE] },
    );

    if (!group) {
      throw new FulfillmentGroupNotFoundError();
    }

    return group;
  }

  private async loadShipmentForWrite(
    entityManager: EntityManager,
    orderId: string,
    shipmentId: string,
  ): Promise<ShipmentEntity> {
    const shipment = await entityManager.getRepository(ShipmentEntity).findOne(
      { id: shipmentId, orderId },
      { populate: ['items'] },
    );

    if (!shipment) {
      throw new ShipmentNotFoundError();
    }

    await entityManager.getRepository(FulfillmentGroupEntity).find(
      { id: shipment.group.id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );

    return shipment;
  }

  private assertSellerGroup(group: FulfillmentGroupEntity): void {
    if (group.method !== FulfillmentMethod.SELLER) {
      throw new UnsupportedFulfillmentMethodError();
    }
  }

  private assertRequestedItems(items: FulfillmentRequestedItem[]): void {
    const seenOrderItemIds = new Set<string>();

    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new InvalidFulfillmentQuantityError();
      }


      if (seenOrderItemIds.has(item.orderItemId)) {
        throw new InvalidFulfillmentQuantityError();
      }

      seenOrderItemIds.add(item.orderItemId);
    }
  }

  private resolveRequestedItems(
    items: FulfillmentRequestedItem[] | undefined,
    groupItems: FulfillmentGroupItemEntity[],
  ): FulfillmentRequestedItem[] {
    if (!items || items.length === 0) {
      return groupItems.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
      }));
    }

    return items;
  }

  private async lockOrderAssignment(
    entityManager: EntityManager,
    orderId: string,
  ): Promise<void> {
    // No Fulfillment row exists to lock before the first assignment. A
    // transaction-scoped key lock closes that gap, so concurrent confirmation
    // replays observe the committed group instead of creating a second one.
    await entityManager.execute(
      'select pg_advisory_xact_lock(hashtextextended(?::text, 0))',
      [orderId],
    );
  }

  private assertItemsWithinGroup(
    requestedItems: FulfillmentRequestedItem[],
    groupItems: FulfillmentGroupItemEntity[],
  ): void {
    const groupOrderItemIds = new Set(groupItems.map((item) => item.orderItemId));

    for (const item of requestedItems) {
      if (!groupOrderItemIds.has(item.orderItemId)) {
        throw new ShipmentItemNotInGroupError();
      }
    }
  }

  private assertQuantityAvailable(
    requestedItems: FulfillmentRequestedItem[],
    groupItems: FulfillmentGroupItemEntity[],
    usedQuantities: Map<string, number>,
  ): void {
    for (const item of requestedItems) {
      const groupItem = groupItems.find(
        (candidate) => candidate.orderItemId === item.orderItemId,
      );
      const available = (groupItem?.quantity ?? 0) - (usedQuantities.get(item.orderItemId) ?? 0);

      if (item.quantity > available) {
        throw new ShipmentQuantityExceededError();
      }
    }
  }

  private sumActiveShipmentQuantities(
    group: FulfillmentGroupEntity,
    excludedShipmentId?: string,
  ): Map<string, number> {
    const used = new Map<string, number>();

    for (const shipment of group.shipments.getItems()) {
      if (shipment.id === excludedShipmentId) {
        continue;
      }

      if (shipment.status === ShipmentStatus.VOIDED) {
        continue;
      }

      for (const item of shipment.items.getItems()) {
        used.set(
          item.orderItemId,
          (used.get(item.orderItemId) ?? 0) + item.quantity,
        );
      }
    }

    return used;
  }
}

function normalizeOptionalText(value?: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.trim() || undefined;
}
