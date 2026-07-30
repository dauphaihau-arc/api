import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { buildPendingReviewImageUploadCacheKey } from './product-review.cache-keys';

export interface PendingReviewImageUploadRecord {
  orderItemId: string;
  userId: string;
  storageKey: string;
  sizeBytes: number;
}

@Injectable()
export class PendingReviewImageUploadService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async trackPending(
    record: PendingReviewImageUploadRecord,
    ttlMs: number,
  ): Promise<void> {
    await this.cacheManager.set<PendingReviewImageUploadRecord>(
      buildPendingReviewImageUploadCacheKey(record.storageKey),
      record,
      ttlMs,
    );
  }

  async getPending(storageKey: string): Promise<PendingReviewImageUploadRecord | undefined> {
    return this.cacheManager.get<PendingReviewImageUploadRecord>(
      buildPendingReviewImageUploadCacheKey(storageKey),
    );
  }

  async clearPending(storageKey: string): Promise<void> {
    await this.cacheManager.del(buildPendingReviewImageUploadCacheKey(storageKey));
  }
}
