import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { parseCarrierEventCode } from '../../../domain/carrier-event';
import { InvalidCarrierEventCodeError } from '../../../domain/errors/fulfillment-domain.error';
import {
  ORDER_FULFILLMENT_UPDATED_EVENT,
  type OrderFulfillmentUpdatedEventPayload,
} from '../../events/order-fulfillment-updated.event';
import {
  SHIPMENT_CARRIER_EVENT_ACCEPTED_EVENT,
  type ShipmentCarrierEventAcceptedPayload,
} from '../../events/shipment-carrier-event-accepted.event';
import { OrderFulfillmentContextPort } from '../../ports/order-fulfillment-context.port';
import { FulfillmentService } from '../../services/fulfillment.service';

export type RecordCarrierEventCommand = {
  eventId: string;
  carrier: string;
  trackingNumber: string;
  eventCode: string;
  location?: string;
  occurredAt: Date;
  rawBody: string;
};

/**
 * Accepts one carrier webhook body as evidence. The command owns the
 * transaction so the Shipment transition, its evidence row, and the delivery
 * outbox event commit together; the accepted event then refreshes the existing
 * Order fulfillment projection and delivery consequence.
 */
@Injectable()
export class RecordCarrierEventUseCase {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly fulfillmentService: FulfillmentService,
    private readonly orderFulfillmentContextPort: OrderFulfillmentContextPort,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(input: RecordCarrierEventCommand): Promise<void> {
    const eventCode = parseCarrierEventCode(input.eventCode);

    if (!eventCode) {
      throw new InvalidCarrierEventCodeError();
    }

    const entityManager = this.entityManager.fork();

    const result = await entityManager.transactional(
      async (transactionalEntityManager) => this.fulfillmentService.recordCarrierEvent(
        transactionalEntityManager,
        {
          carrier: input.carrier,
          trackingNumber: input.trackingNumber,
          eventCode,
          eventId: input.eventId,
          location: input.location,
          occurredAt: input.occurredAt,
          rawBody: input.rawBody,
        },
      ),
    );

    if (result.outcome !== 'accepted' || !result.orderId || !result.shopId) {
      return;
    }

    this.eventEmitter.emit(SHIPMENT_CARRIER_EVENT_ACCEPTED_EVENT, {
      orderId: result.orderId,
      shopId: result.shopId,
      eventCode,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      occurredAt: input.occurredAt,
    } satisfies ShipmentCarrierEventAcceptedPayload);

    const context = await this.orderFulfillmentContextPort.findForFulfillment(
      result.shopId,
      result.orderId,
    );

    if (!context) {
      return;
    }

    this.eventEmitter.emit(ORDER_FULFILLMENT_UPDATED_EVENT, {
      orderId: context.id,
      shopId: context.shopId,
      customerUserId: context.customerUserId,
      // Shipment-update notifications own carrier scans; the generic fulfillment
      // notification would otherwise fire for every scan and duplicate delivery.
      notifyBuyer: false,
    } satisfies OrderFulfillmentUpdatedEventPayload);
  }
}
