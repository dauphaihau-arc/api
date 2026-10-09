import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import { unauthorizedErrorExamples } from '~/domains/auth/api/rest/errors/auth-error-examples';

type ErrorResponses = Readonly<Record<number, readonly ApiErrorExample[]>>;

const chatShopNotFoundExample: ApiErrorExample = {
  code: 'CHAT_SHOP_NOT_FOUND',
  message: 'Shop was not found',
};

const chatProductNotFoundExample: ApiErrorExample = {
  code: 'CHAT_PRODUCT_NOT_FOUND',
  message: 'Product was not found',
};

const chatProductShopMismatchExample: ApiErrorExample = {
  code: 'CHAT_PRODUCT_SHOP_MISMATCH',
  message: 'Product does not belong to the selected shop',
};

const chatConversationNotFoundExample: ApiErrorExample = {
  code: 'CHAT_CONVERSATION_NOT_FOUND',
  message: 'Chat conversation was not found',
};

/** Public error responses for the buyer chat endpoints, selected per route. */
export const meChatErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  createConversation: {
    400: [
      validationErrorExample([
        { field: 'shop_id', messages: ['shop_id must be a string'] },
      ]),
      chatProductShopMismatchExample,
    ],
    404: [chatShopNotFoundExample, chatProductNotFoundExample],
  },
  listConversations: {
    400: [
      validationErrorExample([
        { field: 'page', messages: ['page must not be less than 1'] },
      ]),
    ],
  },
  messages: {
    404: [chatConversationNotFoundExample],
  },
  markRead: {
    404: [chatConversationNotFoundExample],
  },
  sendMessage: {
    400: [
      validationErrorExample([
        {
          field: 'body',
          messages: ['body must be shorter than or equal to 5000 characters'],
        },
      ]),
    ],
    404: [chatConversationNotFoundExample],
  },
} satisfies Record<string, ErrorResponses>;
