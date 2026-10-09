import type { ApiErrorExample } from '~/platform/http/api-error-responses.decorator';

/**
 * The 401 codes emitted by `JwtAuthGuard` when the access-token cookie is
 * absent, expired or invalid. Owned by the auth domain so guarded controllers
 * in every domain document the same guard failures.
 */
export const unauthorizedErrorExamples: readonly ApiErrorExample[] = [
  { code: 'AUTH_REQUIRED', message: 'Authentication is required' },
  { code: 'ACCESS_TOKEN_MISSING', message: 'Access token is missing' },
  { code: 'ACCESS_TOKEN_EXPIRED', message: 'Access token has expired' },
  { code: 'ACCESS_TOKEN_INVALID', message: 'Access token is invalid' },
];

/**
 * The 403 emitted by `PermissionsGuard` when the authenticated actor lacks a
 * permission the route requires.
 */
export const missingRequiredPermissionsErrorExample: ApiErrorExample = {
  code: 'MISSING_REQUIRED_PERMISSIONS',
  message: 'Missing required permissions',
};
