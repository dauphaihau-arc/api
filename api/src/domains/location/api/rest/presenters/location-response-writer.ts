import type { Response } from 'express';
import { isLocationEtagFresh } from './location-etag';

export const LOCATION_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=604800';

/**
 * Writes a readable Location response manually so a conditional request can
 * answer 304 without a body while a normal request keeps Nest's JSON shape.
 */
export function writeLocationResponse(
  response: Response,
  input: { etag: string; ifNoneMatch?: string; body: unknown },
): void {
  response.setHeader('Cache-Control', LOCATION_CACHE_CONTROL);
  response.setHeader('ETag', input.etag);

  if (isLocationEtagFresh(input.ifNoneMatch, input.etag)) {
    response.status(304).end();
    return;
  }

  response.status(200).json(input.body);
}
