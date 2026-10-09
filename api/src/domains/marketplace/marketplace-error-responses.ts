import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';
import { internalServerErrorExample } from '~/platform/http/api-error-examples';

type ErrorResponses = Readonly<Record<number, readonly ApiErrorExample[]>>;

/** Public error responses for the marketplace endpoints, selected per route. */
export const marketplaceErrorResponses = {
  config: {
    500: [internalServerErrorExample],
  },
} satisfies Record<string, ErrorResponses>;
