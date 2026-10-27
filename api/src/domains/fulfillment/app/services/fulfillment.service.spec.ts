import type { EntityManager } from '@mikro-orm/postgresql';
import type { FinanceConfig, MoneyEventBooking } from '~/platform/config/finance.config';
import {
  OutboxEventStatus,
  type OutboxEventEntity,
} from '~/platform/outbox/outbox-event.entity';
import type { RecordPayoutAvailabilityUseCase } from '~/domains/finance/app/use-cases/record-payout-availability/record-payout-availability.use-case';
import { FulfillmentMethod } from '../../domain/enums/fulfillment-method.enum';
import { FulfillmentOperator } from '../../domain/enums/fulfillment-operator.enum';
import { FulfillmentProvenance } from '../../domain/enums/fulfillment-provenance.enum';
import { ShipmentStatus } from '../../domain/enums/shipment-status.enum';
import type { FulfillmentOrderView } from '../fulfillment.types';
import { FulfillmentService } from './fulfillment.service';
import type { OrderDeliveredOutboxService } from './order-delivered-outbox.service';

const DELIVERED_AT = new Date('2026-10-01T08:00:00.000Z');
const OCCURRED_AT = new Date('2026-10-01T09:00:00.000Z');

type PublishOrderDeliveredEvent = (
  entityManager: EntityManager,
  orderId: string,
  deliveredAt: Date,
  occurredAt: Date,
) => Promise<void>;

describe('FulfillmentService delivered-order booking', () => {
  it('books the payout availability inside the producer transaction when inline booking is enabled', async () => {
    const {
      service,
      fakeEntityManager,
      orderDeliveredOutboxService,
      recordPayoutAvailabilityUseCase,
      outboxEvent,
    } = buildService({ moneyEventBooking: 'inline' });

    await publish(service, fakeEntityManager);

    expect(orderDeliveredOutboxService.createOrderDeliveredEvent).toHaveBeenCalledTimes(1);
    expect(orderDeliveredOutboxService.createOrderDeliveredEvent).toHaveBeenCalledWith(
      fakeEntityManager,
      {
        orderId: 'order-1',
        deliveredAt: DELIVERED_AT,
        occurredAt: OCCURRED_AT,
        evidence: [{
          shipmentId: 'shipment-1',
          shipmentPublicId: 'shp_1',
          deliveredAt: DELIVERED_AT,
        }],
      },
    );
    expect(recordPayoutAvailabilityUseCase.recordWithin).toHaveBeenCalledTimes(1);
    expect(recordPayoutAvailabilityUseCase.recordWithin).toHaveBeenCalledWith(
      fakeEntityManager,
      {
        orderId: 'order-1',
        deliveredAt: DELIVERED_AT.toISOString(),
        occurredAt: OCCURRED_AT.toISOString(),
        evidence: [{
          shipmentId: 'shipment-1',
          shipmentPublicId: 'shp_1',
          deliveredAt: DELIVERED_AT.toISOString(),
        }],
      },
    );
    expect(outboxEvent.status).toBe(OutboxEventStatus.PROCESSED);
    expect(outboxEvent.processedAt).toBe(OCCURRED_AT);
  });

  it('leaves the delivered outbox row pending when booking is left to the worker', async () => {
    const {
      service,
      fakeEntityManager,
      orderDeliveredOutboxService,
      recordPayoutAvailabilityUseCase,
      outboxEvent,
    } = buildService({ moneyEventBooking: 'outbox' });

    await publish(service, fakeEntityManager);

    expect(orderDeliveredOutboxService.createOrderDeliveredEvent).toHaveBeenCalledTimes(1);
    expect(recordPayoutAvailabilityUseCase.recordWithin).not.toHaveBeenCalled();
    expect(outboxEvent.status).toBe(OutboxEventStatus.PENDING);
    expect(outboxEvent.processedAt).toBeUndefined();
  });

  it('publishes nothing until every required unit is delivered', async () => {
    const {
      service,
      fakeEntityManager,
      orderDeliveredOutboxService,
      recordPayoutAvailabilityUseCase,
    } = buildService({ moneyEventBooking: 'inline', deliveredQuantity: 1 });

    await publish(service, fakeEntityManager);

    expect(orderDeliveredOutboxService.createOrderDeliveredEvent).not.toHaveBeenCalled();
    expect(recordPayoutAvailabilityUseCase.recordWithin).not.toHaveBeenCalled();
  });
});

async function publish(
  service: FulfillmentService,
  entityManager: EntityManager,
): Promise<void> {
  const target = service as unknown as {
    publishOrderDeliveredEvent: PublishOrderDeliveredEvent;
  };

  await target.publishOrderDeliveredEvent(
    entityManager,
    'order-1',
    DELIVERED_AT,
    OCCURRED_AT,
  );
}

function buildService(
  options: {
    moneyEventBooking?: MoneyEventBooking;
    deliveredQuantity?: number;
  } = {},
) {
  const fakeEntityManager = {} as unknown as EntityManager;
  const outboxEvent = {
    status: OutboxEventStatus.PENDING,
    processedAt: undefined,
  } as unknown as OutboxEventEntity;
  const orderDeliveredOutboxService = {
    createOrderDeliveredEvent: jest.fn().mockResolvedValue(outboxEvent),
  } as unknown as jest.Mocked<OrderDeliveredOutboxService>;
  const recordPayoutAvailabilityUseCase = {
    recordWithin: jest.fn().mockResolvedValue({ recorded: true }),
  } as unknown as jest.Mocked<RecordPayoutAvailabilityUseCase>;
  const financeConfig: FinanceConfig = {
    moneyEventBooking: options.moneyEventBooking ?? 'outbox',
  };

  const service = new FulfillmentService(
    orderDeliveredOutboxService,
    recordPayoutAvailabilityUseCase,
    financeConfig,
  );

  jest.spyOn(service, 'loadOrderFulfillment').mockResolvedValue(
    new Map([['order-1', buildView(options.deliveredQuantity ?? 2)]]),
  );

  return {
    service,
    fakeEntityManager,
    orderDeliveredOutboxService,
    recordPayoutAvailabilityUseCase,
    outboxEvent,
  };
}

function buildView(orderedQuantity: number): FulfillmentOrderView {
  return {
    groups: [{
      id: 'group-1',
      method: FulfillmentMethod.SELLER,
      operator: FulfillmentOperator.SELLER,
      provenance: FulfillmentProvenance.CONFIRMED_ORDER,
      items: [{ orderItemId: 'order-item-1', quantity: orderedQuantity }],
      shipments: [{
        id: 'shipment-1',
        publicId: 'shp_1',
        groupId: 'group-1',
        status: ShipmentStatus.DELIVERED,
        originCountries: ['US'],
        preparedAt: DELIVERED_AT,
        dispatchedAt: DELIVERED_AT,
        deliveredAt: DELIVERED_AT,
        createdAt: DELIVERED_AT,
        updatedAt: DELIVERED_AT,
        items: [{ orderItemId: 'order-item-1', quantity: orderedQuantity }],
        updates: [],
      }],
      progress: {
        ordered: orderedQuantity,
        prepared: orderedQuantity,
        dispatched: orderedQuantity,
        delivered: orderedQuantity,
        canceled: 0,
        outstanding: 0,
      },
    }],
    progress: {
      ordered: 2,
      prepared: 2,
      dispatched: 2,
      delivered: orderedQuantity,
      canceled: 0,
      outstanding: orderedQuantity === 2 ? 0 : 1,
    },
    hasInTransit: false,
  };
}
