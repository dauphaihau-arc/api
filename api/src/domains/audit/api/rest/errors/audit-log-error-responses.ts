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

/**
 * Public error responses for the admin audit log controller. Every endpoint is
 * gated by `audit.read`; the filters are query parameters, so a malformed
 * filter is rejected by validation before the use case runs.
 */
export const adminAuditLogControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
  list: {
    400: [
      validationErrorExample([
        { field: 'action', messages: ['action must be an array'] },
      ]),
    ],
  },
  export: {
    400: [
      validationErrorExample([
        { field: 'entity_type', messages: ['entity_type must be an array'] },
      ]),
    ],
  },
} satisfies Record<string, ErrorResponses>;
