import type { EntityManager } from '@mikro-orm/postgresql';
import type { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import type { FinanceConfig, MoneyEventBooking } from '~/platform/config/finance.config';
import {
  OutboxEventStatus,
  type OutboxEventEntity,
} from '~/platform/outbox/outbox-event.entity';
import type { CheckoutStockReservationPort } from '../../../checkout/app/ports/checkout-stock-reservation.port';
import type { FulfillmentService } from '../../../fulfillment/app/services/fulfillment.service';
import type { RecordOrderPaidJournalEntryUseCase } from '../../../finance/app/use-cases/record-order-paid-journal-entry/record-order-paid-journal-entry.use-case';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import type { OrderCartCleanupRepository } from '../ports/order-cart-cleanup.repository';
import type { OrderCheckoutSessionRepository } from '../ports/order-checkout-session.repository';
import type { OrderEventsService } from './order-events.service';
import type { OrderInventoryOutboxService } from './order-inventory-outbox.service';
import type { OrderPaidOutboxService } from './order-paid-outbox.service';
import { OrderPaymentService } from './order-payment.service';

describe('OrderPaymentService', () => {
  it('consumes quoted inventory when a Stripe checkout session completes', async () => {
    const {
      service,
      order,
      checkoutStockReservationService,
      orderInventoryOutboxService,
      orderPaidOutboxService,
      orderCartCleanupRepository,
      fulfillmentService,
      recordOrderPaidJournalEntryUseCase,
    } = buildService();

    await service.markCheckoutSessionCompleted('cs_123', {
      paymentIntentId: 'pi_123',
      paymentStatus: 'paid',
      completedAt: new Date('2026-09-09T07:00:00.000Z'),
    });

    expect(checkoutStockReservationService.consumeReservationsForOrder).toHaveBeenCalledWith(
      expect.anything(),
      {
        orderId: 'order-1',
        reservationId: 'reservation-1',
        items: [{ inventoryId: 'inventory-1', quantity: 2 }],
      },
    );
    expect(orderInventoryOutboxService.createOrderCreatedEvent).toHaveBeenCalledWith(
      expect.anything(),
      {
        orderIds: ['order-1'],
        reservationId: 'reservation-1',
        items: [{ inventoryId: 'inventory-1', quantity: 2 }],
      },
    );
    expect(orderPaidOutboxService.createOrderPaidEvent).toHaveBeenCalledTimes(1);
    expect(orderPaidOutboxService.createOrderPaidEvent).toHaveBeenCalledWith(
      expect.anything(),
      {
        orderId: 'order-1',
        orderPublicId: 'ord_1',
        shopId: 'shop-1',
        currency: 'USD',
        subtotalMinor: 1800,
        discountMinor: 0,
        shippingMinor: 1150,
        totalMinor: 2950,
        occurredAt: new Date('2026-09-09T07:00:00.000Z'),
      },
    );
    expect(recordOrderPaidJournalEntryUseCase.recordWithin).not.toHaveBeenCalled();
    expect(fulfillmentService.assignSellerGroupToOrder).toHaveBeenCalledWith(
      expect.anything(),
      {
        orderId: 'order-1',
        shopId: 'shop-1',
        items: [{ orderItemId: 'order-item-1', quantity: 2 }],
        actor: {
          actorType: 'system',
          source: 'checkout',
        },
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

  it('stores the card summary alongside the payment details', async () => {
    const { service, order } = buildService();

    await service.markCheckoutSessionCompleted('cs_123', {
      paymentIntentId: 'pi_123',
      paymentStatus: 'paid',
      completedAt: new Date('2026-09-09T07:00:00.000Z'),
      cardBrand: 'visa',
      cardLast4: '4821',
      cardFunding: 'credit',
    });

    expect(order.paymentDetails).toEqual(expect.objectContaining({
      checkout_session_id: 'cs_123',
      payment_intent_id: 'pi_123',
      payment_status: 'paid',
      card_brand: 'visa',
      card_last4: '4821',
      card_funding: 'credit',
    }));
  });

  it('books the paid Order inside the producer transaction when inline booking is enabled', async () => {
    const {
      service,
      fakeEntityManager,
      orderPaidOutboxService,
      recordOrderPaidJournalEntryUseCase,
    } = buildService({ moneyEventBooking: 'inline' });
    const outboxEvent = {
      status: OutboxEventStatus.PENDING,
      processedAt: undefined,
    } as unknown as OutboxEventEntity;
    orderPaidOutboxService.createOrderPaidEvent.mockResolvedValue(outboxEvent);

    await service.markCheckoutSessionCompleted('cs_123', {
      paymentIntentId: 'pi_123',
      paymentStatus: 'paid',
      completedAt: new Date('2026-09-09T07:00:00.000Z'),
    });

    expect(orderPaidOutboxService.createOrderPaidEvent).toHaveBeenCalledTimes(1);
    expect(recordOrderPaidJournalEntryUseCase.recordWithin).toHaveBeenCalledTimes(1);
    expect(recordOrderPaidJournalEntryUseCase.recordWithin).toHaveBeenCalledWith(
      fakeEntityManager,
      {
        orderId: 'order-1',
        orderPublicId: 'ord_1',
        shopId: 'shop-1',
        currency: 'USD',
        subtotalMinor: 1800,
        discountMinor: 0,
        shippingMinor: 1150,
        totalMinor: 2950,
        occurredAt: '2026-09-09T07:00:00.000Z',
      },
    );
    expect(outboxEvent.status).toBe(OutboxEventStatus.PROCESSED);
    expect(outboxEvent.processedAt).toEqual(new Date('2026-09-09T07:00:00.000Z'));
  });

  it('does not reprice the accepted shipping charge or estimate when payment is replayed', async () => {
    const { service, order, checkoutStockReservationService } = buildService();

    await service.markCheckoutSessionCompleted('cs_123', {
      paymentIntentId: 'pi_123',
      paymentStatus: 'paid',
    });
    await service.markCheckoutSessionCompleted('cs_123', {
      paymentIntentId: 'pi_123',
      paymentStatus: 'paid',
    });

    expect(order.shippingMinor).toBe(1150);
    expect(order.totalMinor).toBe(2950);
    expect(order.shippingEstimatedDelivery).toEqual(new Date('2026-09-30T00:00:00.000Z'));
    expect(order.shippingQuoteSnapshot.shipping.charge.total_minor).toBe(1150);
    expect(checkoutStockReservationService.consumeReservationsForOrder).toHaveBeenCalledTimes(1);
  });

  it('releases quoted reservations without restoring already-held stock', async () => {
    const {
      service,
      checkoutStockReservationService,
      orderPaidOutboxService,
      fakeEntityManager,
    } = buildService();
    const expiredAt = new Date('2026-09-09T07:15:00.000Z');

    await service.markCheckoutSessionExpired('cs_123', expiredAt);

    expect(checkoutStockReservationService.releaseReservationsForOrder).toHaveBeenCalledWith(
      fakeEntityManager,
      'order-1',
      {
        releasedAt: expiredAt,
        reservationId: 'reservation-1',
      },
    );
    expect(checkoutStockReservationService.restoreInventoryForOrderItems).not.toHaveBeenCalled();
    expect(orderPaidOutboxService.createOrderPaidEvent).not.toHaveBeenCalled();
  });
});

function buildService(
  options: { moneyEventBooking?: MoneyEventBooking } = {},
) {
  const order = {
    id: 'order-1',
    publicId: 'ord_1',
    status: OrderStatus.AWAITING_PAYMENT,
    shop: { id: 'shop-1' },
    currency: 'USD',
    subtotalMinor: 1800,
    shippingMinor: 1150,
    discountMinor: 0,
    totalMinor: 2950,
    shippingEstimatedDelivery: new Date('2026-09-30T00:00:00.000Z'),
    shippingQuoteSnapshot: {
      shipping: {
        shop_id: 'shop-1',
        currency: 'USD',
        charge: {
          currency: 'USD',
          quantity: 2,
          base_unit: {
            product_id: 'product-1',
            inventory_id: 'inventory-1',
            one_item_fee_minor: 900,
          },
          base_item_fee_minor: 900,
          base_item_total_minor: 900,
          additional_items_quantity: 1,
          additional_components: [
            {
              product_id: 'product-1',
              inventory_id: 'inventory-1',
              quantity: 1,
              additional_item_fee_minor: 250,
            },
          ],
          additional_item_fee_minor_total: 250,
          total_minor: 1150,
        },
        estimate: {
          processing_time_min_days: 1,
          processing_time_max_days: 3,
          delivery_time_min_days: 3,
          delivery_time_max_days: 5,
          combined_min_days: 4,
          combined_max_days: 8,
          anchor_at: '2026-09-22T10:00:00.000Z',
          earliest_delivery_date: '2026-09-26T00:00:00.000Z',
          latest_delivery_date: '2026-09-30T00:00:00.000Z',
        },
        units: [],
      },
      shipping_discount_minor: 0,
      shipping_discounts: [],
    },
    paymentDetails: {
      cart_id: 'cart-1',
      is_temp_cart: true,
      quote_id: 'quote-1',
      reservation_id: 'reservation-1',
      quoted_inventory_ids: ['inventory-1'],
    },
  };
  const orderItem = {
    id: 'order-item-1',
    order: { id: 'order-1' },
    inventory: { id: 'inventory-1' },
    product: { id: 'product-1' },
    quantity: 2,
  };
  const orderItemRepository = {
    find: jest.fn().mockResolvedValue([orderItem]),
  };
  const fakeEntityManager = {
    getRepository: jest.fn((entity: { name?: string }) => {
      if (entity?.name === 'OrderItemEntity') {
        return orderItemRepository;
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
  const jobDispatcher = {
    dispatch: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<JobDispatcher>;
  const checkoutStockReservationService = {
    consumeReservationsForOrder: jest.fn().mockResolvedValue(undefined),
    releaseReservationsForOrder: jest.fn().mockResolvedValue(undefined),
    restoreInventoryForOrderItems: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<CheckoutStockReservationPort>;
  const orderInventoryOutboxService = {
    createOrderCreatedEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OrderInventoryOutboxService>;
  const orderPaidOutboxService = {
    createOrderPaidEvent: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OrderPaidOutboxService>;
  const orderEventsService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OrderEventsService>;
  const orderCheckoutSessionRepository = {
    findOrdersByCheckoutSession: jest.fn().mockResolvedValue([order]),
  } as unknown as jest.Mocked<OrderCheckoutSessionRepository>;
  const orderCartCleanupRepository = {
    clearCheckoutCart: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OrderCartCleanupRepository>;
  const fulfillmentService = {
    assignSellerGroupToOrder: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<FulfillmentService>;
  const recordOrderPaidJournalEntryUseCase = {
    recordWithin: jest.fn().mockResolvedValue({ recorded: true }),
  } as unknown as jest.Mocked<RecordOrderPaidJournalEntryUseCase>;
  const financeConfig: FinanceConfig = {
    moneyEventBooking: options.moneyEventBooking ?? 'outbox',
  };

  const service = new OrderPaymentService(
    entityManager,
    jobDispatcher,
    checkoutStockReservationService,
    orderInventoryOutboxService,
    orderPaidOutboxService,
    orderEventsService,
    orderCheckoutSessionRepository,
    orderCartCleanupRepository,
    fulfillmentService,
    recordOrderPaidJournalEntryUseCase,
    financeConfig,
  );

  return {
    service,
    order,
    fakeEntityManager,
    checkoutStockReservationService,
    orderInventoryOutboxService,
    orderPaidOutboxService,
    orderCartCleanupRepository,
    fulfillmentService,
    recordOrderPaidJournalEntryUseCase,
  };
}
