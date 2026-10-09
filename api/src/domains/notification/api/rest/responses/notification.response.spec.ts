import { toNotificationListResponse, toNotificationResponse } from './notification.response';

describe('notification.response', () => {
  it('maps notification data into snake_case recursively', () => {
    const response = toNotificationResponse({
      id: 'notification-1',
      userId: 'user-1',
      type: 'seller.order.created',
      channel: 'in_app',
      title: 'New order received',
      body: 'Order ORD-20260604-000001 has been placed.',
      data: {
        target: 'seller_order_detail',
        orderId: 'order-1',
        orderNumber: 'ORD-20260604-000001',
        shopId: 'shop-1',
        refundStatus: 'succeeded',
        nestedValue: {
          actorType: 'buyer',
        },
      },
      readAt: new Date('2026-06-04T12:44:12.693Z'),
      createdAt: new Date('2026-06-04T12:43:41.082Z'),
      updatedAt: new Date('2026-06-04T12:44:12.693Z'),
    });

    expect(response.data).toEqual({
      target: 'seller_order_detail',
      order_id: 'order-1',
      order_number: 'ORD-20260604-000001',
      shop_id: 'shop-1',
      refund_status: 'succeeded',
      nested_value: {
        actor_type: 'buyer',
      },
    });
  });

  it('maps paginated notifications into snake_case', () => {
    const response = toNotificationListResponse({
      results: [
        {
          id: 'notification-1',
          userId: 'user-1',
          type: 'seller.order.created',
          channel: 'in_app',
          title: 'New order received',
          body: 'Order ORD-20260604-000001 has been placed.',
          data: {
            orderId: 'order-1',
          },
          createdAt: new Date('2026-06-04T12:43:41.082Z'),
          updatedAt: new Date('2026-06-04T12:44:12.693Z'),
        },
      ],
      page: 1,
      limit: 8,
      totalPages: 1,
      totalResults: 1,
    });

    expect(response).toMatchObject({
      results: [
        {
          data: {
            order_id: 'order-1',
          },
        },
      ],
      page: 1,
      limit: 8,
      total_pages: 1,
      total_results: 1,
    });
  });
});
