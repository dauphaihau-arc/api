import type { EntityManager } from '@mikro-orm/postgresql';
import type { PaymentGateway } from '~/modules/shared/payment/app/ports/payment-gateway';
import { OrderStatus } from '../domain/enums/order-status.enum';
import { OrderCheckoutOutboxService } from './order-checkout-outbox.service';
import { OutboxEventStatus } from '../infra/persistence/entities/outbox-event.entity';

describe('OrderCheckoutOutboxService', () => {
  function buildService(options?: { paymentFails?: boolean; attemptCount?: number }) {
    const outboxEvent = {
      id: 'outbox-1',
      eventName: 'order.checkout-session-requested',
      aggregateType: 'order',
      aggregateId: 'order-1',
      payload: {
        userId: 'user-1',
        customerEmail: 'member@example.com',
        cartId: 'cart-1',
        orderIds: ['order-1'],
        currency: 'USD',
        lineItems: [
          {
            name: 'Product 1',
            unitAmount: 9,
            quantity: 2,
          },
        ],
        shippingAmount: 0,
        discountAmount: 2,
        shippingAddress: {
          fullName: 'Member User',
          address1: '123 Main St',
          city: 'Los Angeles',
          country: 'US',
          state: 'CA',
          zip: '90001',
          phone: '123456789',
        },
      },
      status: OutboxEventStatus.PENDING,
      attemptCount: options?.attemptCount ?? 0,
      availableAt: new Date(Date.now() - 1_000),
      processedAt: undefined,
      lastError: undefined,
    };

    const order = {
      id: 'order-1',
      status: OrderStatus.CHECKOUT_PENDING,
      paymentDetails: {
        type: 'card',
      },
    };

    const fakeEntityManager = {
      create: jest.fn((_entity: unknown, input: Record<string, unknown>) => ({
        id: 'outbox-created',
        ...input,
      })),
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([order]),
      findOne: jest.fn().mockResolvedValue(outboxEvent),
      findOneOrFail: jest.fn().mockImplementation(async () => outboxEvent),
      transactional: jest.fn(async (callback: (em: EntityManager) => Promise<unknown>) =>
        callback(fakeEntityManager as unknown as EntityManager)),
    };

    const entityManager = {
      ...fakeEntityManager,
      fork: jest.fn(() => ({
        ...fakeEntityManager,
        transactional: jest.fn(async (callback: (em: EntityManager) => Promise<unknown>) =>
          callback(fakeEntityManager as unknown as EntityManager)),
      })),
    } as unknown as EntityManager;

    const paymentGateway: jest.Mocked<PaymentGateway> = {
      createStripeCheckoutSession: options?.paymentFails
        ? jest.fn().mockRejectedValue(new Error('Stripe down'))
        : jest.fn().mockResolvedValue({
          id: 'cs_test_1',
          url: 'https://stripe.test/session-1',
          expiresAt: new Date('2026-05-20T12:00:00.000Z'),
        }),
      constructStripeWebhookEvent: jest.fn(),
      retrieveStripeCheckoutSession: jest.fn(),
    } as unknown as jest.Mocked<PaymentGateway>;

    const service = new OrderCheckoutOutboxService(
      entityManager,
      paymentGateway
    );

    return {
      service,
      paymentGateway,
      outboxEvent,
      order,
    };
  }

  it('creates a Stripe session and marks the outbox event processed', async () => {
    const { service, paymentGateway, outboxEvent, order } = buildService();

    const result = await service.processEventById('outbox-1');

    expect(paymentGateway.createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: 'member@example.com',
        currency: 'USD',
      })
    );
    expect(result).toEqual({
      id: 'cs_test_1',
      url: 'https://stripe.test/session-1',
    });
    expect(order.status).toBe(OrderStatus.AWAITING_PAYMENT);
    expect(order.paymentDetails).toEqual(
      expect.objectContaining({
        checkout_session_id: 'cs_test_1',
        checkout_session_url: 'https://stripe.test/session-1',
      })
    );
    expect(outboxEvent.status).toBe(OutboxEventStatus.PROCESSED);
    expect(outboxEvent.processedAt).toBeInstanceOf(Date);
  });

  it('reschedules the outbox event when Stripe session creation fails', async () => {
    const { service, outboxEvent, order } = buildService({
      paymentFails: true,
    });

    const result = await service.processEventById('outbox-1');

    expect(result).toBeUndefined();
    expect(order.status).toBe(OrderStatus.CHECKOUT_PENDING);
    expect(outboxEvent.status).toBe(OutboxEventStatus.PENDING);
    expect(outboxEvent.attemptCount).toBe(1);
    expect(outboxEvent.lastError).toBe('Stripe down');
    expect(outboxEvent.availableAt.getTime()).toBeGreaterThan(Date.now());
  });
});
