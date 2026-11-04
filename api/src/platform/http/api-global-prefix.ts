import { RequestMethod } from '@nestjs/common';

/**
 * Global HTTP prefix applied to API routes (see bootstrap `setGlobalPrefix`).
 * Centralized so path-aware interceptors do not hardcode a version segment.
 */
export const API_GLOBAL_PREFIX = 'v1';

/**
 * Options passed to `setGlobalPrefix` alongside {@link API_GLOBAL_PREFIX}.
 *
 * Shared by the runtime bootstrap and the OpenAPI generator so published paths
 * match production, including the operational routes that stay unprefixed.
 */
export const API_GLOBAL_PREFIX_OPTIONS = {
  exclude: [
    {
      path: 'health',
      method: RequestMethod.GET,
    },
    {
      path: 'health/ready',
      method: RequestMethod.GET,
    },
    {
      path: 'metrics',
      method: RequestMethod.GET,
    },
  ],
};
