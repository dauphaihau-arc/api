import type { StorefrontLanguage } from '~/platform/config/marketplace.config';
import {
  OutboundMessageRenderer,
  resolveOutboundMessageLanguage,
} from '~/platform/localization/outbound-messages/outbound-message-renderer';
import type {
  OutboundMessageCatalog,
  RenderedEmailMessage,
} from '~/platform/localization/outbound-messages/outbound-message.types';

export const GUEST_ORDER_CONFIRMATION_MESSAGE_ID = 'order.guest-order-confirmation';

export type GuestOrderConfirmationMessageData = {
  orderNumbers: string;
  shopNames: string;
  trackingUrl: string;
};

const guestOrderConfirmationShopFallback: Record<StorefrontLanguage, string> = {
  en: 'our marketplace',
  vi: 'sàn của chúng tôi',
};

/**
 * Guest order confirmation copy, owned by the Order domain. English is the
 * source catalog; Vietnamese is reviewed in-repository. A missing Vietnamese
 * message falls the whole message back to English.
 */
export const guestOrderConfirmationCatalog = {
  [GUEST_ORDER_CONFIRMATION_MESSAGE_ID]: {
    en: {
      email: {
        subject: 'Order confirmation: {{orderNumbers}}',
        heading: 'Your order is confirmed',
        paragraphs: [
          'Thanks for your order from {{shopNames}}.',
          'Order: {{orderNumbers}}',
        ],
        action: {
          label: 'Track your order',
          url: '{{trackingUrl}}',
        },
      },
    },
    vi: {
      email: {
        subject: 'Xác nhận đơn hàng: {{orderNumbers}}',
        heading: 'Đơn hàng của bạn đã được xác nhận',
        paragraphs: [
          'Cảm ơn bạn đã đặt hàng từ {{shopNames}}.',
          'Mã đơn hàng: {{orderNumbers}}',
        ],
        action: {
          label: 'Theo dõi đơn hàng',
          url: '{{trackingUrl}}',
        },
      },
    },
  },
} satisfies OutboundMessageCatalog;

const renderer = new OutboundMessageRenderer();

export function resolveGuestOrderConfirmationLanguage(
  language: string,
): StorefrontLanguage {
  return resolveOutboundMessageLanguage(
    guestOrderConfirmationCatalog,
    GUEST_ORDER_CONFIRMATION_MESSAGE_ID,
    language,
  );
}

export function renderGuestOrderConfirmationEmail(
  language: string,
  data: GuestOrderConfirmationMessageData,
  catalog: OutboundMessageCatalog = guestOrderConfirmationCatalog,
): RenderedEmailMessage {
  return renderer.renderEmail(catalog, {
    messageId: GUEST_ORDER_CONFIRMATION_MESSAGE_ID,
    language,
    data,
  });
}

export function resolveGuestOrderConfirmationShopSummary(
  shopNames: readonly string[],
  language: StorefrontLanguage,
): string {
  if (shopNames.length > 0) {
    return shopNames.join(', ');
  }

  return guestOrderConfirmationShopFallback[language];
}
