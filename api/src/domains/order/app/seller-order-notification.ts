import type { NotifyUserInput } from '~/domains/notification/app/notification.types';

type SellerOrderNotificationData = Record<string, unknown> & {
  target: 'seller_order_detail';
  orderId: string;
  orderNumber: string;
  shopId: string;
  actor?: 'buyer' | 'admin' | 'system';
  status?: string;
  refundStatus?: 'succeeded' | 'failed';
};

export function getSellerOrderNotificationRecipientId(input: {
  shop?: {
    ownerUser?: {
      id?: string;
    };
  };
}): string | null {
  return input.shop?.ownerUser?.id ?? null;
}

function buildSellerOrderNotificationData(
  orderPublicId: string,
  orderNumber: string,
  shopPublicId: string,
  overrides?: Omit<SellerOrderNotificationData, 'target' | 'orderId' | 'orderNumber' | 'shopId'>,
): SellerOrderNotificationData {
  return {
    target: 'seller_order_detail',
    orderId: orderPublicId,
    orderNumber,
    shopId: shopPublicId,
    ...overrides,
  };
}

export function buildSellerOrderCreatedNotification(
  userId: string,
  orderPublicId: string,
  orderNumber: string,
  shopPublicId: string,
): NotifyUserInput {
  return {
    userId,
    type: 'seller.order.created',
    title: 'New order received',
    body: `Order ${orderNumber} has been placed.`,
    data: buildSellerOrderNotificationData(orderPublicId, orderNumber, shopPublicId, {
      actor: 'buyer',
    }),
    channels: ['in_app'],
  };
}

export function buildSellerOrderCancelRequestedNotification(
  userId: string,
  orderPublicId: string,
  orderNumber: string,
  shopPublicId: string,
): NotifyUserInput {
  return {
    userId,
    type: 'seller.order.cancel_requested',
    title: 'Cancel request received',
    body: `Customer requested cancellation for order ${orderNumber}.`,
    data: buildSellerOrderNotificationData(orderPublicId, orderNumber, shopPublicId, {
      actor: 'buyer',
      status: 'canceled',
    }),
    channels: ['in_app'],
  };
}

export function buildSellerOrderSupportRequestedNotification(
  userId: string,
  orderPublicId: string,
  orderNumber: string,
  shopPublicId: string,
): NotifyUserInput {
  return {
    userId,
    type: 'seller.order.support_requested',
    title: 'Support request received',
    body: `Customer sent a support request for order ${orderNumber}.`,
    data: buildSellerOrderNotificationData(orderPublicId, orderNumber, shopPublicId, {
      actor: 'buyer',
    }),
    channels: ['in_app'],
  };
}

export function buildSellerOrderRefundNotification(
  userId: string,
  orderPublicId: string,
  orderNumber: string,
  shopPublicId: string,
  refundStatus: 'succeeded' | 'failed',
): NotifyUserInput {
  return {
    userId,
    type: `seller.order.refund_${refundStatus}`,
    title: refundStatus === 'succeeded' ? 'Refund completed' : 'Refund failed',
    body: refundStatus === 'succeeded'
      ? `Refund for order ${orderNumber} completed successfully.`
      : `Refund for order ${orderNumber} failed and needs attention.`,
    data: buildSellerOrderNotificationData(orderPublicId, orderNumber, shopPublicId, {
      actor: 'system',
      refundStatus,
    }),
    channels: ['in_app'],
  };
}
