import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';

/**
 * Reusable public error example payloads for the `@ApiErrorResponses`
 * decorator.
 *
 * Endpoint controllers keep the response statuses and select the examples that
 * actually apply; this module only owns the shared, exact payload shapes so the
 * same failure is documented identically everywhere. It never declares a
 * status and never builds an automatic status list.
 */
export const rateLimitErrorExample: ApiErrorExample = {
  code: 'RATE_LIMIT_EXCEEDED',
  message: 'Too Many Requests',
};

export const internalServerErrorExample: ApiErrorExample = {
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Internal server error',
};

/**
 * Returned with 409 by the category identity generation gate when a
 * category-bearing request arrives without the active
 * `x-category-identity-generation`.
 */
export const categoryIdentityGenerationMismatchExample: ApiErrorExample = {
  code: 'CATEGORY_IDENTITY_GENERATION_MISMATCH',
  message: 'Category identity generation is outdated; reload required',
};

export function validationErrorExample(
  fields: readonly { field: string; messages: readonly string[] }[],
): ApiErrorExample {
  return {
    code: 'VALIDATION_FAILED',
    message: 'Validation failed',
    details: { fields },
  };
}
