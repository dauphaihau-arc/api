import { EntityManager, LockMode } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import {
  FINANCE_CONFIG,
  type FinanceConfig,
} from '~/platform/config/finance.config';
import { OutboxEventStatus } from '~/platform/outbox/outbox-event.entity';
import { RecordPayoutAvailabilityUseCase } from '~/domains/finance/app/use-cases/record-payout-availability/record-payout-availability.use-case';
import { FulfillmentMethod } from '../../domain/enums/fulfillment-method.enum';
import { FulfillmentOperator } from '../../domain/enums/fulfillment-operator.enum';
import { FulfillmentProvenance } from '../../domain/enums/fulfillment-provenance.enum';
import { ShipmentLabelStatus } from '../../domain/enums/shipment-label-status.enum';
import { ShipmentStatus } from '../../domain/enums/shipment-status.enum';
import { ShipmentUpdateActorType } from '../../domain/enums/shipment-update-actor-type.enum';
import { ShipmentUpdateSource } from '../../domain/enums/shipment-update-source.enum';
import { isDispatchStatus } from '../../domain/shipment-journey';
import {
  findCarrier,
  isValidCarrierTrackingNumber,
} from '../../domain/carrier-catalogue';
import {
  CarrierEventCode,
  resolveCarrierEventStatus,
} from '../../domain/carrier-event';
import { loadOrderFulfillmentViews } from '../fulfillment-view.loader';
import type { LoadOrderFulfillmentOptions } from '../fulfillment-view.loader';
import { FulfillmentGroupEntity } from '../../infra/persistence/entities/fulfillment-group.entity';
import { FulfillmentGroupItemEntity } from '../../infra/persistence/entities/fulfillment-group-item.entity';
import { ShipmentEntity } from '../../infra/persistence/entities/shipment.entity';
import { ShipmentItemEntity } from '../../infra/persistence/entities/shipment-item.entity';
import { ShipmentLabelEntity } from '../../infra/persistence/entities/shipment-label.entity';
import { ShipmentUpdateEntity } from '../../infra/persistence/entities/shipment-update.entity';
import {
  FulfillmentGroupAlreadyAssignedError,
  FulfillmentGroupNotFoundError,
  FulfillmentGroupSelectionRequiredError,
  FulfillmentReconciliationRequiredError,
  ShipmentLabelNotFoundError,
  ShipmentLabelRequiresRefundError,
  ShipmentLabelUsedError,
  ShipmentNotFoundError,
} from '../errors/fulfillment-app.error';
import {
  InvalidCarrierTrackingNumberError,
  InvalidFulfillmentQuantityError,
  ShipmentAlreadyVoidedError,
  ShipmentHandoverRequirementsError,
  ShipmentItemNotInGroupError,
  ShipmentNotPreparedError,
  ShipmentQuantityExceededError,
  UnsupportedCarrierError,
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
import { OrderDeliveredOutboxService } from './order-delivered-outbox.service';
import {
  buildOrderDeliveredEvent,
  type OrderDeliveredEventInput,
} from '../events/order-delivered.event';

/** Carrier and tracking stay correctable this long after the handover. */
const HANDOVER_AMEND_WINDOW_MS = ms('3d');

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

export type DeclareHandoverInput = {
  orderId: string;
  shopId: string;
  shipmentId: string;
  actor: FulfillmentActor;
};

export type RecordCarrierEventInput = {
  carrier: string;
  trackingNumber: string;
  eventCode: CarrierEventCode;
  eventId: string;
  location?: string;
  occurredAt: Date;
  /** The exact wire body, kept as evidence beside the normalized columns. */
  rawBody: string;
};

export type CarrierEventOutcome = 'accepted' | 'duplicate' | 'unknown';

export type CarrierEventRecordResult = {
  outcome: CarrierEventOutcome;

  /** Present only for an accepted event, so the caller can project it. */
  orderId?: string;

  shopId?: string;
};

@Injectable()
export class FulfillmentService {
  constructor(
    private readonly orderDeliveredOutboxService: OrderDeliveredOutboxService,
    private readonly recordPayoutAvailabilityUseCase: RecordPayoutAvailabilityUseCase,
    @Inject(FINANCE_CONFIG) private readonly financeConfig: FinanceConfig,
  ) {}

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

  /**
   * Read-only preflight for commands that must buy or reserve something
   * external before they open their transaction. The write path re-runs the
   * same checks under its locks, so this only prevents paying for a parcel the
   * command would immediately reject.
   */
  async assertPreparable(
    entityManager: EntityManager,
    input: { orderId: string; groupId?: string; items?: FulfillmentRequestedItem[] },
    options: { lock?: boolean } = {},
  ): Promise<{ group: FulfillmentGroupEntity; requestedItems: FulfillmentRequestedItem[] }> {
    const group = await this.loadGroupForWrite(
      entityManager,
      input.orderId,
      input.groupId,
      options.lock !== false,
    );
    this.assertSellerGroup(group);
    this.assertRequestedItems(input.items ?? []);

    const groupItems = group.items.getItems();
    const requestedItems = this.resolveRequestedItems(input.items, groupItems);
    this.assertItemsWithinGroup(requestedItems, groupItems);

    const usedQuantities = this.sumActiveShipmentQuantities(group);
    this.assertQuantityAvailable(requestedItems, groupItems, usedQuantities);

    return { group, requestedItems };
  }

  async prepareShipment(
    entityManager: EntityManager,
    input: PrepareShipmentInput,
  ): Promise<ShipmentEntity> {
    const { group, requestedItems } = await this.assertPreparable(entityManager, {
      orderId: input.orderId,
      groupId: input.groupId,
      items: input.items,
    });

    const carrier = normalizeOptionalText(input.carrier);
    const trackingNumber = normalizeOptionalText(input.trackingNumber);
    this.assertCarrierTrackingNumber(carrier, trackingNumber);

    // A new Shipment records the Order's origin countries; the address snapshot
    // is immutable historical evidence on older Shipments and is never rewritten.
    const shipment = entityManager.create(ShipmentEntity, {
      group,
      orderId: group.orderId,
      shopId: group.shopId,
      status: ShipmentStatus.PREPARED,
      carrier,
      trackingNumber,
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

  /**
   * Persists the carrier artifact bought for a Shipment preparation. The row is
   * written in the same transaction as the Shipment, so a label is never
   * recorded without its parcel and vice versa.
   */
  async recordShipmentLabel(
    entityManager: EntityManager,
    input: {
      shipment: ShipmentEntity;
      publicId: string;
      quoteId: string;
      carrierLabelId: string;
      carrier: string;
      service: string;
      trackingNumber: string;
      priceMinor: number;
      currency: string;
      pdfStorageKey: string;
    },
  ): Promise<ShipmentLabelEntity> {
    const label = entityManager.create(ShipmentLabelEntity, {
      publicId: input.publicId,
      shipment: input.shipment,
      orderId: input.shipment.orderId,
      shopId: input.shipment.shopId,
      carrier: input.carrier,
      service: input.service,
      quoteId: input.quoteId,
      carrierLabelId: input.carrierLabelId,
      trackingNumber: input.trackingNumber,
      priceMinor: input.priceMinor,
      currency: input.currency,
      pdfStorageKey: input.pdfStorageKey,
    });

    entityManager.persist(label);
    await entityManager.flush();

    return label;
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

    if (
      shipment.status !== ShipmentStatus.PREPARED
      && !(await this.isAmendableAfterHandover(entityManager, shipment))
    ) {
      throw new ShipmentNotPreparedError();
    }

    const group = await this.loadGroupForWrite(entityManager, input.orderId, shipment.group.id);
    const groupItems = group.items.getItems();

    // After handover only carrier and tracking may change: the goods are already
    // with the carrier, so re-splitting quantities would rewrite buyer progress
    // for a parcel that has left the seller.
    if (input.items !== undefined && shipment.status !== ShipmentStatus.PREPARED) {
      throw new ShipmentNotPreparedError();
    }

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

    const carrier = input.carrier === undefined
      ? shipment.carrier ?? undefined
      : normalizeOptionalText(input.carrier);

    const trackingNumber = input.trackingNumber === undefined
      ? shipment.trackingNumber ?? undefined
      : normalizeOptionalText(input.trackingNumber);

    this.assertCarrierTrackingNumber(carrier, trackingNumber);

    shipment.carrier = carrier;
    shipment.trackingNumber = trackingNumber;

    if (input.note !== undefined) {
      shipment.note = normalizeOptionalText(input.note);
    }

    entityManager.persist(entityManager.create(ShipmentUpdateEntity, {
      shipment,
      status: shipment.status,
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

    const label = await entityManager
      .getRepository(ShipmentLabelEntity)
      .findOne({ shipment: shipment.id });

    if (label) {
      throw new ShipmentLabelRequiresRefundError();
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
   * Voids a Shipment together with its unused Label. A prepared or dispatched
   * Shipment is still refundable until the carrier scans the parcel; refunding
   * keeps every update and the voided rows as history, while the quantities
   * stop counting toward progress. Repeating the refund of an already voided
   * label changes nothing and reports `refunded: false`.
   */
  async refundLabel(
    entityManager: EntityManager,
    input: {
      orderId: string;
      shopId: string;
      shipmentId: string;
      actor: FulfillmentActor;
    },
  ): Promise<{ refunded: boolean; label?: ShipmentLabelEntity }> {
    const shipment = await this.loadShipmentForWrite(
      entityManager,
      input.orderId,
      input.shipmentId,
    );

    if (shipment.shopId !== input.shopId) {
      throw new ShipmentNotFoundError();
    }

    const label = await entityManager
      .getRepository(ShipmentLabelEntity)
      .findOne(
        { shipment: shipment.id, orderId: input.orderId, shopId: input.shopId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );

    if (!label) {
      throw new ShipmentLabelNotFoundError();
    }

    if (label.status === ShipmentLabelStatus.VOIDED) {
      return { refunded: false, label };
    }

    if (label.status === ShipmentLabelStatus.USED) {
      throw new ShipmentLabelUsedError();
    }

    if (
      shipment.status !== ShipmentStatus.VOIDED
      && shipment.status !== ShipmentStatus.PREPARED
      && shipment.status !== ShipmentStatus.DISPATCHED
    ) {
      throw new ShipmentLabelUsedError();
    }

    label.status = ShipmentLabelStatus.VOIDED;

    if (shipment.status !== ShipmentStatus.VOIDED) {
      const voidedAt = new Date();

      shipment.status = ShipmentStatus.VOIDED;
      shipment.voidedAt = voidedAt;

      entityManager.persist(entityManager.create(ShipmentUpdateEntity, {
        shipment,
        status: ShipmentStatus.VOIDED,
        actorType: input.actor.actorType,
        actorId: input.actor.actorId,
        source: input.actor.source,
        occurredAt: voidedAt,
      }));
    }

    await entityManager.flush();

    return { refunded: true, label };
  }

  /**
   * Records the seller's Handover Declaration: the one status authority the
   * seller keeps. It requires a carrier and a tracking number, happens at most
   * once, and only ever sets dispatch, so replaying it is a no-op. Everything
   * after handover comes from Carrier Evidence.
   */
  async declareHandover(
    entityManager: EntityManager,
    input: DeclareHandoverInput,
  ): Promise<ShipmentEntity> {
    const shipment = await this.loadShipmentForWrite(
      entityManager,
      input.orderId,
      input.shipmentId,
    );

    if (shipment.status === ShipmentStatus.VOIDED) {
      throw new ShipmentAlreadyVoidedError();
    }

    // A replay of the declaration, or a shipment a carrier already moved, has
    // nothing left to declare.
    if (shipment.status !== ShipmentStatus.PREPARED) {
      if (isDispatchStatus(shipment.status)) {
        return shipment;
      }

      throw new ShipmentNotPreparedError();
    }

    const carrier = shipment.carrier;
    const trackingNumber = shipment.trackingNumber;

    if (!carrier || !trackingNumber) {
      throw new ShipmentHandoverRequirementsError();
    }

    this.assertCarrierTrackingNumber(carrier, trackingNumber);

    const dispatchedAt = new Date();

    shipment.status = ShipmentStatus.DISPATCHED;
    shipment.dispatchedAt = dispatchedAt;

    entityManager.persist(entityManager.create(ShipmentUpdateEntity, {
      shipment,
      status: ShipmentStatus.DISPATCHED,
      actorType: input.actor.actorType,
      actorId: input.actor.actorId,
      source: input.actor.source,
      occurredAt: dispatchedAt,
      note: shipment.note,
    }));

    await entityManager.flush();

    return shipment;
  }

  /**
   * Ingests one signed carrier event. The event is resolved to exactly one live
   * Shipment by `(carrier, tracking number)`; a repeated event id or an unknown
   * pair is acknowledged without a write. Every accepted event records its own
   * Shipment Update, even when the event does not move the status, and a stale
   * event never regresses later evidence.
   */
  async recordCarrierEvent(
    entityManager: EntityManager,
    input: RecordCarrierEventInput,
  ): Promise<CarrierEventRecordResult> {
    const carrier = input.carrier.trim().toLowerCase();
    const trackingNumber = input.trackingNumber.trim();
    const eventId = input.eventId.trim();

    // Concurrent deliveries of the same carrier event serialize here, so the
    // replay check or its unique index can never turn an acknowledgement into a
    // write. Event ids are unique per carrier, not globally.
    await entityManager.execute(
      'select pg_advisory_xact_lock(hashtextextended(?::text, 0))',
      [`carrier-event:${carrier}:${eventId}`],
    );

    const duplicate = await entityManager
      .getRepository(ShipmentUpdateEntity)
      .findOne({ actorId: carrier, carrierEventId: eventId });

    if (duplicate) {
      return { outcome: 'duplicate' };
    }

    // Resolved without a lock: the group lock below is what serializes this
    // write against dispatch and cancellation, and the shipment itself is
    // re-read under a write lock afterwards.
    const resolved = await entityManager.getRepository(ShipmentEntity).findOne({
      carrier,
      trackingNumber,
    });

    if (!resolved) {
      return { outcome: 'unknown' };
    }

    await entityManager.getRepository(FulfillmentGroupEntity).find(
      { id: resolved.group.id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );

    const shipment = await entityManager.getRepository(ShipmentEntity).findOne(
      { id: resolved.id, carrier, trackingNumber },
      { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
    );

    if (!shipment || shipment.status === ShipmentStatus.VOIDED) {
      return { outcome: 'unknown' };
    }

    const resultingStatus = resolveCarrierEventStatus(
      shipment.status,
      input.eventCode,
    );
    const becameDelivered = resultingStatus === ShipmentStatus.DELIVERED
      && shipment.status !== ShipmentStatus.DELIVERED;

    shipment.status = resultingStatus;

    // The carrier's first real scan puts the label into use. LABEL_CREATED only
    // confirms preparation, so a parcel that was never picked up stays
    // refundable.
    if (input.eventCode !== CarrierEventCode.LABEL_CREATED) {
      const label = await entityManager
        .getRepository(ShipmentLabelEntity)
        .findOne({ shipment: shipment.id });

      if (label?.status === ShipmentLabelStatus.PURCHASED) {
        label.status = ShipmentLabelStatus.USED;
        entityManager.persist(label);
      }
    }

    // Handover is implied by any dispatch-or-later carrier evidence: a carrier
    // cannot scan a parcel it was never given.
    if (isDispatchStatus(resultingStatus) && !shipment.dispatchedAt) {
      shipment.dispatchedAt = input.occurredAt;
    }

    if (becameDelivered) {
      shipment.deliveredAt = input.occurredAt;
    }

    entityManager.persist(entityManager.create(ShipmentUpdateEntity, {
      shipment,
      status: resultingStatus,
      actorType: ShipmentUpdateActorType.CARRIER,
      actorId: carrier,
      source: ShipmentUpdateSource.CARRIER,
      occurredAt: input.occurredAt,
      eventCode: input.eventCode,
      location: normalizeOptionalText(input.location),
      carrierEventId: eventId,
      payload: parseCarrierEventBody(input.rawBody),
    }));

    await entityManager.flush();

    if (becameDelivered) {
      // The existing delivery path owns Order completion and Payout
      // Availability; carrier delivery is not a second mechanism.
      await this.publishOrderDeliveredEvent(
        entityManager,
        shipment.orderId,
        shipment.deliveredAt ?? input.occurredAt,
        new Date(),
      );
    }

    return {
      outcome: 'accepted',
      orderId: shipment.orderId,
      shopId: shipment.shopId,
    };
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

  /**
   * Publishes the order's delivery event once every required unit of the order is
   * delivered. Partial delivery, an order without groups, and fully voided units
   * publish nothing. Runs on the caller's EntityManager so the delivery fact and
   * its event commit together.
   */
  private async publishOrderDeliveredEvent(
    entityManager: EntityManager,
    orderId: string,
    deliveredAt: Date,
    occurredAt: Date,
  ): Promise<void> {
    const views = await this.loadOrderFulfillment(entityManager, [orderId]);
    const view = views.get(orderId);

    if (!view || view.progress.ordered === 0 || view.progress.delivered < view.progress.ordered) {
      return;
    }

    const evidence = view.groups
      .flatMap((group) => group.shipments)
      .filter((shipment) => shipment.status === ShipmentStatus.DELIVERED)
      .map((shipment) => ({
        shipmentId: shipment.id,
        shipmentPublicId: shipment.publicId,
        deliveredAt: shipment.deliveredAt ?? deliveredAt,
      }));

    const input: OrderDeliveredEventInput = {
      orderId,
      deliveredAt,
      occurredAt,
      evidence,
    };

    const orderDeliveredOutboxEvent =
      await this.orderDeliveredOutboxService.createOrderDeliveredEvent(entityManager, input);

    // `inline` books the payout availability inside the producer's transaction,
    // so a booking failure rolls the delivery back and the seller's request can
    // be retried. The outbox row is kept and marked processed as evidence, and
    // the worker skips it.
    if (this.financeConfig.moneyEventBooking === 'inline') {
      await this.recordPayoutAvailabilityUseCase.recordWithin(
        entityManager,
        buildOrderDeliveredEvent(input),
      );
      orderDeliveredOutboxEvent.status = OutboxEventStatus.PROCESSED;
      orderDeliveredOutboxEvent.processedAt = occurredAt;
    }
  }

  private async loadGroupForWrite(
    entityManager: EntityManager,
    orderId: string,
    groupId?: string,
    lock = true,
  ): Promise<FulfillmentGroupEntity> {
    const locked = await entityManager.getRepository(FulfillmentGroupEntity).find(
      groupId ? { id: groupId, orderId } : { orderId },
      lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {},
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

  /**
   * After handover, a seller may still correct carrier and tracking for a short
   * window. The window closes at a fixed age, and a carrier scan closes it early:
   * once the carrier has the parcel, the label and the timeline must agree.
   */
  private async isAmendableAfterHandover(
    entityManager: EntityManager,
    shipment: ShipmentEntity,
  ): Promise<boolean> {
    if (shipment.status !== ShipmentStatus.DISPATCHED || !shipment.dispatchedAt) {
      return false;
    }

    if (Date.now() - shipment.dispatchedAt.getTime() > HANDOVER_AMEND_WINDOW_MS) {
      return false;
    }

    const earliestCarrierScan = await entityManager
      .getRepository(ShipmentUpdateEntity)
      .findOne({ shipment: shipment.id, source: ShipmentUpdateSource.CARRIER });

    return earliestCarrierScan === null;
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

  /**
   * A missing carrier or tracking number skips the pattern check; a recorded
   * carrier must be one the catalogue knows, and its tracking number must match
   * the format the provider publishes. `other` accepts any non-empty number.
   */
  private assertCarrierTrackingNumber(
    carrier?: string | null,
    trackingNumber?: string | null,
  ): void {
    if (!carrier) {
      // A number with no carrier cannot be validated, so it is not recordable;
      // a carrier without a number is an unfinished preparation and is allowed.
      if (trackingNumber) {
        throw new InvalidCarrierTrackingNumberError();
      }

      return;
    }

    const carrierDefinition = findCarrier(carrier);

    if (!carrierDefinition) {
      throw new UnsupportedCarrierError();
    }

    if (
      trackingNumber != null
      && !isValidCarrierTrackingNumber(carrierDefinition, trackingNumber)
    ) {
      throw new InvalidCarrierTrackingNumberError();
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

/**
 * The wire body is already JSON by the time the event reaches the service. It is
 * kept as parsed evidence so the carrier's own fields survive normalization;
 * a non-object body is retained verbatim rather than discarded.
 */
function parseCarrierEventBody(rawBody: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(rawBody);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  catch {
    // Fall through to the verbatim evidence below.
  }

  return { raw_body: rawBody };
}
