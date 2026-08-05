import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import type { NotifyUserUseCase } from '~/domains/notification/app/use-cases/notify-user/notify-user.use-case';
import { UserStatus } from '../../../../auth/domain/enums/user-status.enum';
import { RequestOrderSupportUseCase } from './request-order-support.use-case';

describe('RequestOrderSupportUseCase', () => {
  it('stores a customer support note on the order', async () => {
    const actor: AuthenticatedUser = {
      userId: 'user-1',
      email: 'buyer@example.com',
      status: UserStatus.ACTIVE,
      sessionId: 'session-1',
      roles: [],
      permissions: [],
    };
    const order = {
      id: 'order-1',
      orderNumber: 'ORD-20260604-000001',
      shop: {
        id: 'shop-1',
        shopName: 'Shop 1',
        slug: 'shop-1',
        ownerUser: {
          id: 'seller-1',
        },
      },
      customerEmail: 'buyer@example.com',
      paymentType: 'card',
      status: 'paid',
      promoCodes: [],
      shippingStatus: 'pre_transit',
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
    } as unknown as EntityManager;
    const notifyUserUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotifyUserUseCase>;

    const useCase = new RequestOrderSupportUseCase({
      fork: jest.fn(() => fakeEntityManager),
    } as unknown as EntityManager, notifyUserUseCase);

    const result = await useCase.execute(actor, 'order-1', {
      supportNote: 'Need help changing the address',
    });

    expect(order.customerSupportNote).toBe('Need help changing the address');
    expect(fakeEntityManager.flush).toHaveBeenCalled();
    expect(notifyUserUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'seller-1',
      type: 'seller.order.support_requested',
      body: 'Customer sent a support request for order ORD-20260604-000001.',
      data: expect.objectContaining({
        target: 'seller_order_detail',
        orderId: 'order-1',
        orderNumber: 'ORD-20260604-000001',
        shopId: 'shop-1',
      }),
    }));
    expect(result.customerSupportNote).toBe('Need help changing the address');
  });
});
