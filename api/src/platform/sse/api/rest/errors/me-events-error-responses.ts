import { unauthorizedErrorExamples } from '~/domains/auth/api/rest/errors/auth-error-examples';
import {
  internalServerErrorExample,
  rateLimitErrorExample,
} from '~/platform/http/api-error-examples';
import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';

/** JSON failures before the SSE connection starts, not errors inside the stream. */
export const meEventsErrorResponses = {
  stream: {
    401: unauthorizedErrorExamples,
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
} satisfies Record<string, Readonly<Record<number, readonly ApiErrorExample[]>>>;
