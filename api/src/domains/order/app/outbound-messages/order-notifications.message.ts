import {
  MissingOutboundMessageDataError,
  OutboundMessageRenderer,
  UnknownOutboundMessageError,
} from '~/platform/localization/outbound-messages/outbound-message-renderer';
import type {
  OutboundMessageCatalog,
  OutboundMessageData,
  RenderedNotificationMessage,
} from '~/platform/localization/outbound-messages/outbound-message.types';

export const ORDER_CANCELED_NOTIFICATION_ID = 'order.canceled';
export const ORDER_FULFILLMENT_UPDATED_NOTIFICATION_ID = 'order.fulfillment.updated';
export const ORDER_SHIPMENT_UPDATED_NOTIFICATION_ID = 'order.shipment.updated';

export const ORDER_NOTIFICATION_TYPES = [
  ORDER_CANCELED_NOTIFICATION_ID,
  ORDER_FULFILLMENT_UPDATED_NOTIFICATION_ID,
  ORDER_SHIPMENT_UPDATED_NOTIFICATION_ID,
] as const;

export type OrderNotificationType = (typeof ORDER_NOTIFICATION_TYPES)[number];

export function isOrderNotificationType(
  type: string,
): type is OrderNotificationType {
  return (ORDER_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

export interface OrderNotificationData extends OutboundMessageData {
  orderNumber: string;
}

/**
 * Buyer order notification copy, owned by the Order domain. English is the
 * source catalog; Vietnamese is reviewed in-repository. A missing Vietnamese
 * message falls the whole message back to English.
 */
export const orderNotificationCatalog = {
  [ORDER_CANCELED_NOTIFICATION_ID]: {
    en: {
      notification: {
        title: 'Order canceled',
        body: 'Order {{orderNumber}} was canceled.',
      },
    },
    vi: {
      notification: {
        title: 'Đơn hàng đã hủy',
        body: 'Đơn hàng {{orderNumber}} đã bị hủy.',
      },
    },
  },
  [ORDER_FULFILLMENT_UPDATED_NOTIFICATION_ID]: {
    en: {
      notification: {
        title: 'Order updated',
        body: 'Order {{orderNumber}} was updated.',
      },
    },
    vi: {
      notification: {
        title: 'Đơn hàng đã cập nhật',
        body: 'Đơn hàng {{orderNumber}} đã được cập nhật.',
      },
    },
  },
  [ORDER_SHIPMENT_UPDATED_NOTIFICATION_ID]: {
    en: {
      notification: {
        title: 'Shipment updated',
        body: 'Shipment for order {{orderNumber}} was updated.',
      },
    },
    vi: {
      notification: {
        title: 'Vận chuyển đã cập nhật',
        body: 'Thông tin vận chuyển của đơn hàng {{orderNumber}} đã được cập nhật.',
      },
    },
  },
} satisfies OutboundMessageCatalog;

const renderer = new OutboundMessageRenderer();

export function renderOrderNotification(
  language: string,
  type: OrderNotificationType,
  data: OrderNotificationData,
  catalog: OutboundMessageCatalog = orderNotificationCatalog,
): RenderedNotificationMessage {
  return renderer.renderNotification(catalog, {
    messageId: type,
    language,
    data,
  });
}

/**
 * Resolves localized order-notification copy and falls back to the stored
 * English row for unknown types or incomplete legacy data. Shared by in-app
 * reads and Web Push dispatch so both channels use the same compatibility path.
 */
export function resolveOrderNotificationCopy(
  language: string,
  type: string,
  data: Record<string, unknown> | undefined,
  fallback: RenderedNotificationMessage,
): RenderedNotificationMessage {
  if (!isOrderNotificationType(type) || !data) {
    return fallback;
  }

  try {
    return renderOrderNotification(language, type, data as OrderNotificationData);
  }
  catch (error) {
    if (
      error instanceof UnknownOutboundMessageError
      || error instanceof MissingOutboundMessageDataError
    ) {
      return fallback;
    }

    throw error;
  }
}
