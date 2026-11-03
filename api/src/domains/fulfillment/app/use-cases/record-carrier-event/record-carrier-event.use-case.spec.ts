import type { EntityManager } from '@mikro-orm/postgresql';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { CarrierEventCode } from '../../../domain/carrier-event';
import { SHIPMENT_CARRIER_EVENT_ACCEPTED_EVENT } from '../../events/shipment-carrier-event-accepted.event';
import { ORDER_FULFILLMENT_UPDATED_EVENT } from '../../events/order-fulfillment-updated.event';
import type { FulfillmentService } from '../../services/fulfillment.service';
import { RecordCarrierEventUseCase } from './record-carrier-event.use-case';

function buildSubject(recordResult: {
  outcome: 'accepted' | 'duplicate' | 'unknown';
  orderId?: string;
  shopId?: string;
}) {
  const transactionalEntityManager = {} as EntityManager;
  const entityManager = {
    fork: jest.fn(() => ({
      transactional: jest.fn(async (work: (em: EntityManager) => Promise<unknown>) =>
        work(transactionalEntityManager)),
    })),
  } as unknown as EntityManager;
  const fulfillmentService = {
    recordCarrierEvent: jest.fn().mockResolvedValue(recordResult),
  } as unknown as jest.Mocked<FulfillmentService>;
  const orderFulfillmentContextPort = {
    findForFulfillment: jest.fn().mockResolvedValue({
      id: 'order-1',
      shopId: 'shop-1',
      customerUserId: 'buyer-1',
    }),
  } as unknown as jest.Mocked<{ findForFulfillment: () => Promise<unknown> }>;
  const eventEmitter = {
    emit: jest.fn(),
  } as unknown as jest.Mocked<EventEmitter2>;

  return {
    useCase: new RecordCarrierEventUseCase(
      entityManager,
      fulfillmentService,
      orderFulfillmentContextPort as never,
      eventEmitter,
    ),
    eventEmitter,
    orderFulfillmentContextPort,
  };
}

const command = {
  eventId: 'event-1',
  carrier: 'acme',
  trackingNumber: 'TRACK-1',
  eventCode: 'PICKED_UP',
  occurredAt: new Date('2026-10-30T10:00:00.000Z'),
  rawBody: '{}',
};

describe('RecordCarrierEventUseCase', () => {
  it('emits the accepted carrier event with the resolved order, shop, and shipment facts', async () => {
    const { useCase, eventEmitter } = buildSubject({
      outcome: 'accepted',
      orderId: 'order-1',
      shopId: 'shop-1',
    });

    await useCase.execute(command);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      SHIPMENT_CARRIER_EVENT_ACCEPTED_EVENT,
      {
        orderId: 'order-1',
        shopId: 'shop-1',
        eventCode: CarrierEventCode.PICKED_UP,
        carrier: 'acme',
        trackingNumber: 'TRACK-1',
        occurredAt: command.occurredAt,
      },
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      ORDER_FULFILLMENT_UPDATED_EVENT,
      expect.objectContaining({ notifyBuyer: false }),
    );
  });

  it('does not emit the carrier event when the event id is a replay', async () => {
    const { useCase, eventEmitter, orderFulfillmentContextPort } = buildSubject({
      outcome: 'duplicate',
    });

    await useCase.execute(command);

    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      SHIPMENT_CARRIER_EVENT_ACCEPTED_EVENT,
      expect.anything(),
    );
    expect(orderFulfillmentContextPort.findForFulfillment).not.toHaveBeenCalled();
  });

  it('does not emit the carrier event when no live shipment matches', async () => {
    const { useCase, eventEmitter } = buildSubject({ outcome: 'unknown' });

    await useCase.execute(command);

    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      SHIPMENT_CARRIER_EVENT_ACCEPTED_EVENT,
      expect.anything(),
    );
  });
});
