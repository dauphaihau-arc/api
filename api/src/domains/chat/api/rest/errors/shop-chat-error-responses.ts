import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import {
  missingRequiredPermissionsErrorExample,
  unauthorizedErrorExamples,
} from '~/domains/auth/api/rest/errors/auth-error-examples';

type ErrorResponses = Readonly<Record<number, readonly ApiErrorExample[]>>;

const shopOwnershipForbiddenExample: ApiErrorExample = {
  code: 'FORBIDDEN',
  message: 'You do not own this shop',
};

const shopNotFoundExample: ApiErrorExample = {
  code: 'NOT_FOUND',
  message: 'Shop was not found',
};

const chatConversationNotFoundExample: ApiErrorExample = {
  code: 'CHAT_CONVERSATION_NOT_FOUND',
  message: 'Chat conversation was not found',
};

/** Public error responses for the shop chat endpoints, selected per route. */
export const shopChatErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample, shopOwnershipForbiddenExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  listConversations: {
    400: [
      validationErrorExample([
        { field: 'page', messages: ['page must not be less than 1'] },
      ]),
    ],
    404: [shopNotFoundExample],
  },
  unreadCount: {
    404: [shopNotFoundExample],
  },
  messages: {
    404: [shopNotFoundExample, chatConversationNotFoundExample],
  },
  markRead: {
    404: [shopNotFoundExample, chatConversationNotFoundExample],
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
    404: [shopNotFoundExample, chatConversationNotFoundExample],
  },
} satisfies Record<string, ErrorResponses>;
