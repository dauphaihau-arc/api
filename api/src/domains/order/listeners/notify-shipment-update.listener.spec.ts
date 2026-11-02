import type { EntityManager } from '@mikro-orm/postgresql';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { NotifyUserUseCase } from '~/domains/notification/app/use-cases/notify-user/notify-user.use-case';
import { CarrierEventCode } from '../../fulfillment/domain/carrier-event';
import { ORDER_UPDATED_SSE_EVENT } from '../app/events/order-sse.event';
import { NotifyShipmentUpdateListener } from './notify-shipment-update.listener';

const occurredAt = new Date('2026-10-30T10:00:00.000Z');

function buildSubject(order: unknown = {
  id: 'order-1',
  publicId: 'ord_public1',
  orderNumber: 'ORD-20261030-000001',
  user: { id: 'buyer-1' },
  shop: {
    publicId: 'shop_public1',
    ownerUser: { id: 'seller-1' },
  },
}) {
  const findOne = jest.fn().mockResolvedValue(order);
  const entityManager = {
    fork: jest.fn(() => ({ findOne })),
  } as unknown as EntityManager;
  const notifyUserUseCase = {
    execute: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NotifyUserUseCase>;
  const eventEmitter = {
    emit: jest.fn(),
  } as unknown as jest.Mocked<EventEmitter2>;

  return {
    listener: new NotifyShipmentUpdateListener(
      entityManager,
      notifyUserUseCase,
      eventEmitter,
    ),
    findOne,
    notifyUserUseCase,
    eventEmitter,
  };
}

function payload(eventCode: CarrierEventCode) {
  return {
    orderId: 'order-1',
    shopId: 'shop-1',
    eventCode,
    carrier: 'acme',
    trackingNumber: 'TRACK-1',
    occurredAt,
  };
}

describe('NotifyShipmentUpdateListener', () => {
  it.each([
    [CarrierEventCode.PICKED_UP, 'Order on the way', 'Order ORD-20261030-000001 was picked up by the carrier.'],
    [CarrierEventCode.DELIVERED, 'Order delivered', 'Order ORD-20261030-000001 was delivered.'],
  ])(
    'notifies the buyer and the seller when %s is accepted',
    async (eventCode, title, body) => {
      const { listener, notifyUserUseCase, eventEmitter } = buildSubject();

      await listener.handle(payload(eventCode));

      expect(notifyUserUseCase.execute).toHaveBeenCalledTimes(2);
      for (const userId of ['buyer-1', 'seller-1']) {
        expect(notifyUserUseCase.execute).toHaveBeenCalledWith({
          userId,
          type: 'order.shipment.updated',
          title,
          body,
          data: {
            orderId: 'ord_public1',
            shopId: 'shop_public1',
            eventCode,
            trackingNumber: 'TRACK-1',
          },
          channels: ['in_app', 'web_push'],
        });

        expect(eventEmitter.emit).toHaveBeenCalledWith(ORDER_UPDATED_SSE_EVENT, {
          userId,
          orderId: 'ord_public1',
          changed: ['fulfillment'],
          occurredAt: occurredAt.toISOString(),
        });
      }
    },
  );

  it.each([
    CarrierEventCode.LABEL_CREATED,
    CarrierEventCode.IN_TRANSIT,
    CarrierEventCode.OUT_FOR_DELIVERY,
    CarrierEventCode.DELIVERY_FAILED,
    CarrierEventCode.RETURNED,
  ])('refreshes both pages but sends no notification for %s', async (eventCode) => {
    const {
      listener, findOne, notifyUserUseCase, eventEmitter,
    } = buildSubject();

    await listener.handle(payload(eventCode));

    expect(findOne).toHaveBeenCalled();
    expect(notifyUserUseCase.execute).not.toHaveBeenCalled();
    expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      ORDER_UPDATED_SSE_EVENT,
      expect.objectContaining({ userId: 'buyer-1' }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      ORDER_UPDATED_SSE_EVENT,
      expect.objectContaining({ userId: 'seller-1' }),
    );
  });

  it('notifies nobody when the order no longer exists', async () => {
    const { listener, notifyUserUseCase, eventEmitter } = buildSubject(null);

    await listener.handle(payload(CarrierEventCode.PICKED_UP));

    expect(notifyUserUseCase.execute).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('still tells the seller when the order has no buyer account', async () => {
    const { listener, notifyUserUseCase } = buildSubject({
      id: 'order-1',
      publicId: 'ord_public1',
      orderNumber: 'ORD-20261030-000001',
      user: undefined,
      shop: {
        publicId: 'shop_public1',
        ownerUser: { id: 'seller-1' },
      },
    });

    await listener.handle(payload(CarrierEventCode.DELIVERED));

    expect(notifyUserUseCase.execute).toHaveBeenCalledTimes(1);
    expect(notifyUserUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'seller-1' }),
    );
  });
});
