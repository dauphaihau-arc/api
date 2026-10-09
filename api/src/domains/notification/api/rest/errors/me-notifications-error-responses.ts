import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import {
  internalServerErrorExample,
  rateLimitErrorExample,
  validationErrorExample,
} from '~/platform/http/api-error-examples';
import { unauthorizedErrorExamples } from '~/domains/auth/api/rest/errors/auth-error-examples';

type ErrorResponses = Readonly<Record<number, readonly ApiErrorExample[]>>;

const notificationNotFoundExample: ApiErrorExample = {
  code: 'NOT_FOUND',
  message: 'Notification not found',
};

const endpointValidationExample: ApiErrorExample = validationErrorExample([
  { field: 'endpoint', messages: ['endpoint should not be empty'] },
]);

/** Public error responses for the my-notifications endpoints, per route. */
export const meNotificationsErrorResponses = {
  common: {
    401: unauthorizedErrorExamples,
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  list: {
    400: [
      validationErrorExample([
        { field: 'page', messages: ['page must not be less than 1'] },
      ]),
    ],
  },
  markRead: {
    404: [notificationNotFoundExample],
  },
  registerPush: {
    400: [endpointValidationExample],
  },
  unregisterPush: {
    400: [endpointValidationExample],
  },
} satisfies Record<string, ErrorResponses>;
