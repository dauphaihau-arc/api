import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import {
  internalServerErrorExample,
  rateLimitErrorExample,
} from '~/platform/http/api-error-examples';
import {
  missingRequiredPermissionsErrorExample,
  unauthorizedErrorExamples,
} from '~/domains/auth/api/rest/errors/auth-error-examples';

type ErrorResponses = Readonly<Record<number, readonly ApiErrorExample[]>>;

/**
 * Public error responses for the admin roles controller. The list is gated by
 * `roles.read` and reads a static catalog, so it declares no route-specific
 * failure.
 */
export const adminRolesControllerErrorResponses = {
  controller: {
    401: unauthorizedErrorExamples,
    403: [missingRequiredPermissionsErrorExample],
    429: [rateLimitErrorExample],
    500: [internalServerErrorExample],
  },
} satisfies Record<string, ErrorResponses>;
