import type { EntityManager } from '@mikro-orm/postgresql';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type { CheckoutStockReservationPort } from '../../../checkout/app/ports/checkout-stock-reservation.port';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { CouponUsageEntity } from '../../../coupon/infra/persistence/entities/coupon-usage.entity';
import { OrderItemEntity } from '../../infra/persistence/entities/order-item.entity';
import type { OrderCartCleanupRepository } from '../ports/order-cart-cleanup.repository';
import type { OrderCheckoutSessionRepository } from '../ports/order-checkout-session.repository';
import type { OrderEventsService } from './order-events.service';
import type { OrderInventoryOutboxService } from './order-inventory-outbox.service';
import { OrderPaymentService } from './order-payment.service';

describe('OrderPaymentService', () => {
  it('consumes quoted inventory when a Stripe checkout session completes', async () => {
    const {
      service,
      order,
      checkoutStockReservationService,
      orderInventoryOutboxService,
      orderCartCleanupRepository,
    } = buildService();

    await service.markCheckoutSessionCompleted('cs_123', {
      paymentIntentId: 'pi_123',
      paymentStatus: 'paid',
      completedAt: new Date('2026-09-09T07:00:00.000Z'),
    });

    expect(checkoutStockReservationService.consumeReservationsForQuote).toHaveBeenCalledWith(
      expect.anything(),
      {
        quoteId: 'quote-1',
        items: [{ inventoryId: 'inventory-1', quantity: 2 }],
      },
    );
    expect(orderInventoryOutboxService.createOrderCreatedEvent).toHaveBeenCalledWith(
      expect.anything(),
      {
        orderIds: ['order-1'],
        quoteId: 'quote-1',
        reservationId: 'reservation-1',
        items: [{ inventoryId: 'inventory-1', quantity: 2 }],
      },
    );
    expect(order.status).toBe(OrderStatus.PAID);
    expect(order.paymentDetails).toEqual(expect.objectContaining({
      checkout_session_id: 'cs_123',
      payment_intent_id: 'pi_123',
      payment_status: 'paid',
    }));
    expect(orderCartCleanupRepository.clearCheckoutCart).toHaveBeenCalledWith(
      {
        cartId: 'cart-1',
        isTempCart: true,
        inventoryIds: ['inventory-1'],
      },
      { entityManager: expect.anything() },
    );
  });

  it('releases quoted reservations without restoring already-held stock', async () => {
    const {
      service,
      checkoutStockReservationService,
      fakeEntityManager,
    } = buildService();
    const expiredAt = new Date('2026-09-09T07:15:00.000Z');

    await service.markCheckoutSessionExpired('cs_123', expiredAt);

    expect(checkoutStockReservationService.releaseReservationsForQuote).toHaveBeenCalledWith(
      fakeEntityManager,
      'quote-1',
      expiredAt,
    );
    expect(checkoutStockReservationService.restoreInventoryForOrderItems).not.toHaveBeenCalled();
  });
});

function buildService() {
  const order = {
    id: 'order-1',
    status: OrderStatus.AWAITING_PAYMENT,
    paymentDetails: {
      cart_id: 'cart-1',
      is_temp_cart: true,
      quote_id: 'quote-1',
      reservation_id: 'reservation-1',
      quoted_inventory_ids: ['inventory-1'],
    },
  };
  const orderItem = {
    inventory: { id: 'inventory-1' },
    product: { id: 'product-1' },
    quantity: 2,
  };
  const orderItemRepository = {
    find: jest.fn().mockResolvedValue([orderItem]),
  };
  const couponUsageRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const fakeEntityManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === OrderItemEntity) {
        return orderItemRepository;
      }
      if (entity === CouponUsageEntity) {
        return couponUsageRepository;
      }
      throw new Error('Unexpected repository');
    }),
    flush: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn(),
  };
  const entityManager = {
    transactional: jest.fn(async (callback: (em: EntityManager) => Promise<unknown>) =>
      callback(fakeEntityManager as unknown as EntityManager)),
  } as unknown as EntityManager;
  const eventEmitter = {
    emit: jest.fn(),
  } as unknown as EventEmitter2;
  const jobDispatcher = {
    dispatch: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<JobDispatcher>;
  const checkoutStockReservationService = {
    consumeReservationsForQuote: jest.fn().mockResolvedValue(undefined),
    expireReservationsForQuote: jest.fn().mockResolvedValue(1),
    releaseReservationsForQuote: jest.fn().mockResolvedValue(1),
    restoreInventoryForOrderItems: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<CheckoutStockReservationPort>;
  const orderInventoryOutboxService = {
    createOrderCreatedEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OrderInventoryOutboxService>;
  const orderEventsService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OrderEventsService>;
  const orderCheckoutSessionRepository = {
    findOrdersByCheckoutSession: jest.fn().mockResolvedValue([order]),
  } as unknown as jest.Mocked<OrderCheckoutSessionRepository>;
  const orderCartCleanupRepository = {
    clearCheckoutCart: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OrderCartCleanupRepository>;

  const service = new OrderPaymentService(
    entityManager,
    eventEmitter,
    jobDispatcher,
    checkoutStockReservationService,
    orderInventoryOutboxService,
    orderEventsService,
    orderCheckoutSessionRepository,
    orderCartCleanupRepository,
  );

  return {
    service,
    order,
    fakeEntityManager,
    checkoutStockReservationService,
    orderInventoryOutboxService,
    orderCartCleanupRepository,
  };
}
