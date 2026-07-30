import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import {
  STORAGE_CONFIG,
  type StorageConfig,
} from '~/platform/config/storage.config';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { buildReviewImageTicketCacheKey } from '../../product-review.cache-keys';
import { PRODUCT_REVIEW_MAX_IMAGE_BYTES } from '../../product-review.constants';
import type { ReviewImageUploadTicketRecord } from '../issue-review-image-upload-url/issue-review-image-upload-url.use-case';

@Injectable()
export class ConsumeReviewImageUploadTicketUseCase {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly storageService: StorageService,
    @Inject(STORAGE_CONFIG) private readonly storageConfig: StorageConfig,
  ) {}

  async execute(
    token: string,
    body: Buffer,
    contentType?: string,
  ): Promise<{ key: string }> {
    if (this.storageConfig.driver === 'minio') {
      throw new NotFoundException(
        'Upload ticket ingestion is not used for object storage',
      );
    }

    const ticket = await this.cacheManager.get<ReviewImageUploadTicketRecord>(
      buildReviewImageTicketCacheKey(token),
    );

    if (!ticket) {
      throw new NotFoundException('Upload ticket was not found or has expired');
    }

    if (!contentType?.startsWith('image/')) {
      throw new BadRequestException('Upload content type must be an image');
    }

    if (body.byteLength === 0) {
      throw new BadRequestException('Upload body is empty');
    }

    if (body.byteLength > PRODUCT_REVIEW_MAX_IMAGE_BYTES) {
      throw new BadRequestException('Upload body exceeds the review image size limit');
    }

    await this.storageService.putObject({
      key: ticket.storageKey,
      body,
      contentType,
    });

    await this.cacheManager.del(buildReviewImageTicketCacheKey(token));

    return {
      key: ticket.storageKey,
    };
  }
}
