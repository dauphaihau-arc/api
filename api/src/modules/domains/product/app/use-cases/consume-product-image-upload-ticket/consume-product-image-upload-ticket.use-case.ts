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
} from '~/config/storage.config';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import type { ProductImageUploadTicketRecord } from '../issue-product-image-upload-url/issue-product-image-upload-url.use-case';
import { buildTicketCacheKey } from '../issue-product-image-upload-url/issue-product-image-upload-url.use-case';

@Injectable()
export class ConsumeProductImageUploadTicketUseCase {
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

    const ticket = await this.cacheManager.get<ProductImageUploadTicketRecord>(
      buildTicketCacheKey(token),
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

    await this.storageService.putObject({
      key: ticket.storageKey,
      body,
      contentType,
    });

    await this.cacheManager.del(buildTicketCacheKey(token));

    return {
      key: ticket.storageKey,
    };
  }
}
