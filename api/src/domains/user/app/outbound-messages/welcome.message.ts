import {
  OutboundMessageRenderer,
} from '~/platform/localization/outbound-messages/outbound-message-renderer';
import type {
  OutboundMessageCatalog,
  RenderedEmailMessage,
} from '~/platform/localization/outbound-messages/outbound-message.types';

export const WELCOME_MESSAGE_ID = 'account.welcome';

export type WelcomeMessageData = {
  displayName: string;
  email: string;
};

/**
 * Account welcome copy, owned by the User domain. English is the source
 * catalog; Vietnamese is reviewed in-repository. A missing Vietnamese message
 * falls the whole message back to English.
 */
export const welcomeCatalog = {
  [WELCOME_MESSAGE_ID]: {
    en: {
      email: {
        subject: 'Welcome',
        heading: 'Welcome to the marketplace',
        paragraphs: [
          'Hello {{displayName}}, your account was created.',
          'We will use {{email}} for account updates.',
        ],
      },
    },
    vi: {
      email: {
        subject: 'Chào mừng',
        heading: 'Chào mừng bạn đến với sàn',
        paragraphs: [
          'Xin chào {{displayName}}, tài khoản của bạn đã được tạo.',
          'Chúng tôi sẽ dùng {{email}} để gửi thông tin cập nhật về tài khoản.',
        ],
      },
    },
  },
} satisfies OutboundMessageCatalog;

const renderer = new OutboundMessageRenderer();

export function renderWelcomeEmail(
  language: string,
  data: WelcomeMessageData,
  catalog: OutboundMessageCatalog = welcomeCatalog,
): RenderedEmailMessage {
  return renderer.renderEmail(catalog, {
    messageId: WELCOME_MESSAGE_ID,
    language,
    data,
  });
}
