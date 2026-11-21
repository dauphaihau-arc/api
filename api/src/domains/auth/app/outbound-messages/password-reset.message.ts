import {
  OutboundMessageRenderer,
} from '~/platform/localization/outbound-messages/outbound-message-renderer';
import type {
  OutboundMessageCatalog,
  RenderedEmailMessage,
} from '~/platform/localization/outbound-messages/outbound-message.types';

export const PASSWORD_RESET_MESSAGE_ID = 'account.password-reset';

export type PasswordResetMessageData = {
  displayName: string;
  email: string;
  resetUrl: string;
};

/**
 * Password reset copy, owned by the Auth domain. English is the source
 * catalog; Vietnamese is reviewed in-repository. A missing Vietnamese message
 * falls the whole message back to English.
 */
export const passwordResetCatalog = {
  [PASSWORD_RESET_MESSAGE_ID]: {
    en: {
      email: {
        subject: 'Reset your password',
        heading: 'Reset your password',
        paragraphs: [
          'Hello {{displayName}},',
          'We received a request to reset the password for {{email}}. ' +
            'Use the link below to choose a new password.',
        ],
        action: {
          label: 'Reset your password',
          url: '{{resetUrl}}',
        },
      },
    },
    vi: {
      email: {
        subject: 'Đặt lại mật khẩu của bạn',
        heading: 'Đặt lại mật khẩu',
        paragraphs: [
          'Xin chào {{displayName}},',
          'Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho {{email}}. ' +
            'Hãy dùng liên kết bên dưới để chọn mật khẩu mới.',
        ],
        action: {
          label: 'Đặt lại mật khẩu',
          url: '{{resetUrl}}',
        },
      },
    },
  },
} satisfies OutboundMessageCatalog;

const renderer = new OutboundMessageRenderer();

export function renderPasswordResetEmail(
  language: string,
  data: PasswordResetMessageData,
  catalog: OutboundMessageCatalog = passwordResetCatalog,
): RenderedEmailMessage {
  return renderer.renderEmail(catalog, {
    messageId: PASSWORD_RESET_MESSAGE_ID,
    language,
    data,
  });
}
