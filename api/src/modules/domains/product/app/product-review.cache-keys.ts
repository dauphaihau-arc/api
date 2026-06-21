const PRODUCT_REVIEW_CACHE_PREFIX = 'product-review:v1';
const PENDING_REVIEW_IMAGE_UPLOAD_PREFIX = 'review-image-upload:pending';
const REVIEW_IMAGE_UPLOAD_TICKET_PREFIX = 'review-upload:ticket';

export function buildProductReviewEditLimitCacheKey(
  userId: string,
  productId: string,
  now: Date
): string {
  return `${PRODUCT_REVIEW_CACHE_PREFIX}:edit-limit:${userId}:${productId}:${now.toISOString().slice(0, 10)}`;
}

export function millisecondsUntilNextUtcDay(now: Date): number {
  const nextUtcDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );

  return Math.max(1, nextUtcDay - now.getTime());
}

export function buildPendingReviewImageUploadCacheKey(storageKey: string): string {
  return `${PENDING_REVIEW_IMAGE_UPLOAD_PREFIX}:${storageKey}`;
}

export function buildReviewImageTicketCacheKey(token: string): string {
  return `${REVIEW_IMAGE_UPLOAD_TICKET_PREFIX}:${token}`;
}
