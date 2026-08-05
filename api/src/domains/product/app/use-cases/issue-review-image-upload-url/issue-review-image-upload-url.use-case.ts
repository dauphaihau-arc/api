import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import ms from 'ms';
import { randomUUID } from 'node:crypto';
import { resolveImageExtension, resolveStorageEnvironmentSegment, buildStorageObjectKey } from '~/integrations/storage/app/storage-key-builder';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import {
  STORAGE_CONFIG,
  type StorageConfig,
} from '~/platform/config/storage.config';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { OrderItemEntity } from '~/domains/order/infra/persistence/entities/order-item.entity';
import { ProductReviewNotEligibleError, ProductReviewOrderItemNotFoundError } from '../../errors/product-app.error';
import { buildReviewImageTicketCacheKey } from '../../product-review.cache-keys';
import { isEligibleForProductReview } from '../../product-review.helpers';
import { PRODUCT_REVIEW_MAX_IMAGE_BYTES } from '../../product-review.constants';
import { PendingReviewImageUploadService } from '../../pending-review-image-upload.service';

export const REVIEW_IMAGE_UPLOAD_TICKET_TTL_MS = ms('15m');

export interface ReviewImageUploadTicketRecord {
  storageKey: string;
  sizeBytes: number;
}

export interface IssueReviewImageUploadUrlResult {
  token?: string;
  key: string;
  presignedUrl?: string;
}

@Injectable()
export class IssueReviewImageUploadUrlUseCase {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly entityManager: EntityManager,
    @Inject(STORAGE_CONFIG) private readonly storageConfig: StorageConfig,
    private readonly storageService: StorageService,
    private readonly pendingReviewImageUploadService: PendingReviewImageUploadService,
    private readonly jobDispatcher: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    orderItemId: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<IssueReviewImageUploadUrlResult> {
    const entityManager = this.entityManager.fork();
    const orderItem = await entityManager.getRepository(OrderItemEntity).findOne(
      {
        id: orderItemId,
        order: {
          user: actor.userId,
        },
      },
      {
        populate: ['order', 'product'],
      },
    );

    if (!orderItem) {
      throw new ProductReviewOrderItemNotFoundError(orderItemId);
    }

    if (!isEligibleForProductReview(orderItem.order)) {
      throw new ProductReviewNotEligibleError(
        'This order item is not eligible for review yet',
      );
    }

    if (!contentType.startsWith('image/')) {
      throw new BadRequestException('Upload content type must be an image');
    }

    if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException('Upload size must be a positive integer');
    }

    if (sizeBytes > PRODUCT_REVIEW_MAX_IMAGE_BYTES) {
      throw new BadRequestException('Upload body exceeds the review image size limit');
    }

    const extension = resolveImageExtension(contentType);
    const key = buildStorageObjectKey({
      env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
      visibility: 'public',
      pathSegments: [
        'users',
        actor.userId,
        'products',
        orderItem.id,
        'images',
        'product-reviews',
        randomUUID(),
      ],
      extension,
      filename: 'original',
    });

    if (this.storageConfig.driver === 'minio') {
      await this.storageService.ping();

      const client = new S3Client({
        region: this.storageConfig.region,
        endpoint: this.storageConfig.endpoint,
        forcePathStyle: this.storageConfig.forcePathStyle,
        credentials: {
          accessKeyId: this.storageConfig.accessKey,
          secretAccessKey: this.storageConfig.secretKey,
        },
      });

      const presignedUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: this.storageConfig.bucket,
          Key: key,
          ContentType: contentType,
        }),
        {
          expiresIn: Math.floor(REVIEW_IMAGE_UPLOAD_TICKET_TTL_MS / 1000),
        },
      );

      await this.trackPendingUpload(actor.userId, orderItem.id, key, sizeBytes);

      return { key, presignedUrl };
    }

    const token = randomUUID();

    await this.cacheManager.set<ReviewImageUploadTicketRecord>(
      buildReviewImageTicketCacheKey(token),
      { storageKey: key, sizeBytes },
      REVIEW_IMAGE_UPLOAD_TICKET_TTL_MS,
    );

    await this.trackPendingUpload(actor.userId, orderItem.id, key, sizeBytes);

    return { token, key };
  }

  private async trackPendingUpload(
    userId: string,
    orderItemId: string,
    storageKey: string,
    sizeBytes: number,
  ): Promise<void> {
    await this.pendingReviewImageUploadService.trackPending(
      {
        userId,
        orderItemId,
        storageKey,
        sizeBytes,
      },
      REVIEW_IMAGE_UPLOAD_TICKET_TTL_MS * 2,
    );

    await this.jobDispatcher.dispatch(
      appJobName.cleanupPendingReviewImage,
      { storageKey },
      {
        deduplicationKey: appJobDeduplicationKey.cleanupPendingReviewImage(storageKey),
        delayMs: REVIEW_IMAGE_UPLOAD_TICKET_TTL_MS,
      },
    );
  }
}
