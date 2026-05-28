import type { EntityManager } from '@mikro-orm/postgresql';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { UserStatus } from '../../../../auth/domain/enums/user-status.enum';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';
import { OrderStatus } from '../../../domain/enums/order-status.enum';
import { BuyerShippedOrderCancelNotAllowedError } from '../../errors/order-app.error';
import type { OrderCancellationService } from '../../order-cancellation.service';
import { RequestOrderCancelUseCase } from './request-order-cancel.use-case';

describe('RequestOrderCancelUseCase', () => {
  const actor: AuthenticatedUser = {
    userId: 'user-1',
    email: 'buyer@example.com',
    status: UserStatus.ACTIVE,
    sessionId: 'session-1',
    roles: [],
    permissions: [],
  };

  function buildUseCase(input?: {
    status?: OrderStatus
    shippingStatus?: OrderShippingStatus
  }) {
    const order = {
      id: 'order-1',
      shop: {
        id: 'shop-1',
        shopName: 'Shop 1',
        slug: 'shop-1',
      },
      customerEmail: 'buyer@example.com',
      paymentType: 'card',
      status: input?.status ?? OrderStatus.PAID,
      promoCodes: [],
      shippingStatus: input?.shippingStatus ?? OrderShippingStatus.PRE_TRANSIT,
      shippingOriginCountries: ['US'],
      shippingToCountry: 'US',
      shippingEstimatedDelivery: new Date('2026-05-30T00:00:00.000Z'),
      subtotalMinor: 2500,
      shippingMinor: 500,
      discountMinor: 0,
      totalMinor: 3000,
      subtotal: 25,
      totalShippingFee: 5,
      totalDiscount: 0,
      total: 30,
      note: undefined,
      trackingNumber: undefined,
      shippingCarrier: undefined,
      shipmentNote: undefined,
      shippedAt: undefined,
      deliveredAt: undefined,
      canceledAt: undefined,
      cancelReason: undefined,
      customerSupportNote: undefined,
      cancelRequestedAt: undefined,
      createdAt: new Date('2026-05-23T00:00:00.000Z'),
      shippingAddress: {
        full_name: 'Buyer One',
        address1: '123 Main St',
        city: 'Los Angeles',
        country: 'US',
        state: 'CA',
        zip: '90001',
      },
      updatedAt: new Date('2026-05-23T00:00:00.000Z'),
    };
    const items = [{
      id: 'item-1',
      product: { id: 'product-1', slug: 'product-1', shop: { slug: 'shop-1' } },
      title: 'Product 1',
      imageUrl: undefined,
      quantity: 1,
      unitPriceMinor: 2500,
      originalAmountMinor: undefined,
      lineTotalMinor: 2500,
      currency: 'USD',
      price: 25,
      salePrice: undefined,
      variantName: undefined,
      variantGroupName: undefined,
      variantSubGroupName: undefined,
      percentCouponPercent: null,
    }];
    const fakeEntityManager = {
      getRepository: jest.fn((entity: { name?: string }) => {
        switch (entity?.name) {
          case 'OrderEntity':
            return { findOne: jest.fn().mockResolvedValue(order) };
          case 'OrderItemEntity':
            return { find: jest.fn().mockResolvedValue(items) };
          default:
            return {};
        }
      }),
      flush: jest.fn().mockResolvedValue(undefined),
      transactional: jest.fn(async (callback) => await callback(fakeEntityManager)),
    } as unknown as EntityManager;
    const cancellationService = {
      cancelOrder: jest.fn(async (_entityManager, targetOrder, cancelInput) => {
        targetOrder.status = OrderStatus.CANCELED;
        targetOrder.canceledAt = cancelInput.canceledAt;
        targetOrder.cancelReason = cancelInput.cancelReason;
        return { refundRequested: false, inventoryEvents: [] };
      }),
    } as unknown as OrderCancellationService;
    const jobDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    const eventEmitter: Pick<jest.Mocked<EventEmitter2>, 'emit'> = {
      emit: jest.fn(),
    };

    return {
      order,
      fakeEntityManager,
      cancellationService,
      jobDispatcher,
      useCase: new RequestOrderCancelUseCase(
        { fork: jest.fn(() => fakeEntityManager) } as unknown as EntityManager,
        cancellationService,
        jobDispatcher as never,
        eventEmitter as unknown as EventEmitter2
      ),
    };
  }

  it('cancels a pre-transit paid order immediately', async () => {
    const { useCase, order, fakeEntityManager, cancellationService, jobDispatcher } = buildUseCase();

    const result = await useCase.execute(actor, 'order-1', {
      cancelReason: 'Changed my mind',
    })

    expect(order.status).toBe(OrderStatus.CANCELED)
    expect(order.cancelRequestedAt).toBeInstanceOf(Date)
    expect(order.canceledAt).toBeInstanceOf(Date)
    expect(order.cancelReason).toBe('Changed my mind')
    expect(cancellationService.cancelOrder).toHaveBeenCalled()
    expect(fakeEntityManager.flush).toHaveBeenCalled()
    expect(jobDispatcher.dispatch).toHaveBeenCalledWith('order.send-seller-order-update-email', {
      orderId: 'order-1',
      eventType: 'canceled',
    })
    expect(result.status).toBe(OrderStatus.CANCELED)
  })

  it('rejects canceling shipped orders', async () => {
    const { useCase } = buildUseCase({
      shippingStatus: OrderShippingStatus.SHIPPED,
    })

    await expect(
      useCase.execute(actor, 'order-1', {})
    ).rejects.toThrow(BuyerShippedOrderCancelNotAllowedError)
  })
})
