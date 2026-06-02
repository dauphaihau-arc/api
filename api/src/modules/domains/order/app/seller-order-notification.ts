import type { NotifyUserInput } from '~/modules/shared/notification/app/notification.types';

type SellerOrderNotificationData = Record<string, unknown> & {
  target: 'seller_order_detail';
  orderId: string;
  shopId: string;
  actor?: 'buyer' | 'admin' | 'system';
  status?: string;
  refundStatus?: 'succeeded' | 'failed';
}

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
  orderId: string,
  shopId: string,
  overrides?: Omit<SellerOrderNotificationData, 'target' | 'orderId' | 'shopId'>
): SellerOrderNotificationData {
  return {
    target: 'seller_order_detail',
    orderId,
    shopId,
    ...overrides,
  };
}

export function buildSellerOrderCreatedNotification(
  userId: string,
  orderId: string,
  shopId: string
): NotifyUserInput {
  return {
    userId,
    type: 'seller.order.created',
    title: 'New order received',
    body: `Order ${orderId} has been placed.`,
    data: buildSellerOrderNotificationData(orderId, shopId, {
      actor: 'buyer',
    }),
    channels: ['in_app'],
  };
}

export function buildSellerOrderCancelRequestedNotification(
  userId: string,
  orderId: string,
  shopId: string
): NotifyUserInput {
  return {
    userId,
    type: 'seller.order.cancel_requested',
    title: 'Cancel request received',
    body: `Customer requested cancellation for order ${orderId}.`,
    data: buildSellerOrderNotificationData(orderId, shopId, {
      actor: 'buyer',
      status: 'canceled',
    }),
    channels: ['in_app'],
  };
}

export function buildSellerOrderSupportRequestedNotification(
  userId: string,
  orderId: string,
  shopId: string
): NotifyUserInput {
  return {
    userId,
    type: 'seller.order.support_requested',
    title: 'Support request received',
    body: `Customer sent a support request for order ${orderId}.`,
    data: buildSellerOrderNotificationData(orderId, shopId, {
      actor: 'buyer',
    }),
    channels: ['in_app'],
  };
}

export function buildSellerOrderRefundNotification(
  userId: string,
  orderId: string,
  shopId: string,
  refundStatus: 'succeeded' | 'failed'
): NotifyUserInput {
  return {
    userId,
    type: `seller.order.refund_${refundStatus}`,
    title: refundStatus === 'succeeded' ? 'Refund completed' : 'Refund failed',
    body: refundStatus === 'succeeded'
      ? `Refund for order ${orderId} completed successfully.`
      : `Refund for order ${orderId} failed and needs attention.`,
    data: buildSellerOrderNotificationData(orderId, shopId, {
      actor: 'system',
      refundStatus,
    }),
    channels: ['in_app'],
  };
}
