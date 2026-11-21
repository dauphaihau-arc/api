import type { StorefrontLanguage } from '~/platform/config/marketplace.config';
import {
  OutboundMessageRenderer,
  resolveOutboundMessageLanguage,
} from '~/platform/localization/outbound-messages/outbound-message-renderer';
import type {
  OutboundMessageCatalog,
  RenderedEmailMessage,
} from '~/platform/localization/outbound-messages/outbound-message.types';

export const REFUND_SUCCEEDED_MESSAGE_ID = 'order.refund-succeeded';
export const REFUND_FAILED_MESSAGE_ID = 'order.refund-failed';

export type RefundSucceededMessageData = {
  orderPublicId: string;
  shopName: string;
  refundAmount: string;
};

export type RefundFailedMessageData = {
  orderPublicId: string;
  shopName: string;
};

/** Buyer refund messages. Missing Vietnamese copy falls back as a whole. */
export const refundEmailCatalog = {
  [REFUND_SUCCEEDED_MESSAGE_ID]: {
    en: {
      email: {
        subject: 'Refund completed for order {{orderPublicId}}',
        heading: 'Your refund is complete',
        paragraphs: [
          'The refund for your order {{orderPublicId}} from {{shopName}} has completed.',
          'Refund amount: {{refundAmount}}',
        ],
      },
    },
    vi: {
      email: {
        subject: 'Đã hoàn tiền cho đơn hàng {{orderPublicId}}',
        heading: 'Việc hoàn tiền đã hoàn tất',
        paragraphs: [
          'Khoản hoàn tiền cho đơn hàng {{orderPublicId}} từ {{shopName}} đã hoàn tất.',
          'Số tiền hoàn: {{refundAmount}}',
        ],
      },
    },
  },
  [REFUND_FAILED_MESSAGE_ID]: {
    en: {
      email: {
        subject: 'Refund update for order {{orderPublicId}}',
        heading: 'We could not complete your refund',
        paragraphs: [
          'We could not complete the refund for order {{orderPublicId}} from {{shopName}}.',
          'Our support team will review it and follow up if needed.',
        ],
      },
    },
    vi: {
      email: {
        subject: 'Cập nhật hoàn tiền cho đơn hàng {{orderPublicId}}',
        heading: 'Chúng tôi chưa thể hoàn tất việc hoàn tiền',
        paragraphs: [
          'Chúng tôi chưa thể hoàn tất khoản hoàn tiền cho đơn hàng {{orderPublicId}} từ {{shopName}}.',
          'Đội ngũ hỗ trợ của chúng tôi sẽ kiểm tra và liên hệ nếu cần.',
        ],
      },
    },
  },
} satisfies OutboundMessageCatalog;

const renderer = new OutboundMessageRenderer();

export function resolveRefundSucceededLanguage(language: string): StorefrontLanguage {
  return resolveOutboundMessageLanguage(
    refundEmailCatalog,
    REFUND_SUCCEEDED_MESSAGE_ID,
    language,
  );
}

export function renderRefundSucceededEmail(
  language: string,
  data: RefundSucceededMessageData,
  catalog: OutboundMessageCatalog = refundEmailCatalog,
): RenderedEmailMessage {
  return renderer.renderEmail(catalog, {
    messageId: REFUND_SUCCEEDED_MESSAGE_ID,
    language,
    data,
  });
}

export function renderRefundFailedEmail(
  language: string,
  data: RefundFailedMessageData,
  catalog: OutboundMessageCatalog = refundEmailCatalog,
): RenderedEmailMessage {
  return renderer.renderEmail(catalog, {
    messageId: REFUND_FAILED_MESSAGE_ID,
    language,
    data,
  });
}
