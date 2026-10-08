import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import ms from 'ms';
import { randomUUID } from 'node:crypto';
import {
  STORAGE_CONFIG,
  type StorageConfig,
} from '~/platform/config/storage.config';
import { createStorageId } from '~/platform/ids/public-id';
import { buildStorageObjectKey, resolveImageExtension, resolveStorageEnvironmentSegment } from '~/integrations/storage/app/storage-key-builder';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ProductImageAssetType } from '../../../domain/enums/product-image-asset-type.enum';
import type { ProductDraftSummary } from '../../product.types';

const UPLOAD_TICKET_TTL_MS = ms('15m');

export interface ProductImageUploadTicketRecord {
  shopId: string;
  productId: string;
  storageKey: string;
}

export interface IssueProductImageUploadUrlResult {
  token?: string;
  key: string;
  presignedUrl?: string;
}

@Injectable()
export class IssueProductImageUploadUrlUseCase {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(STORAGE_CONFIG) private readonly storageConfig: StorageConfig,
    private readonly storageService: StorageService,
  ) {}

  async execute(
    product: ProductDraftSummary,
    contentType: string,
    assetType: ProductImageAssetType,
  ): Promise<IssueProductImageUploadUrlResult> {
    if (!contentType.startsWith('image/')) {
      throw new BadRequestException('Upload content type must be an image');
    }

    const extension = resolveImageExtension(contentType);
    const imageId = createStorageId();
    const key = buildStorageObjectKey({
      env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
      visibility: 'public',
      pathSegments: [
        'shops',
        product.shopPublicId,
        'products',
        product.publicId,
        'images',
        imageId,
      ],
      extension,
      filename: assetType,
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
          expiresIn: Math.floor(UPLOAD_TICKET_TTL_MS / 1000),
        },
      );

      return {
        key,
        presignedUrl,
      };
    }

    const token = randomUUID();

    await this.cacheManager.set<ProductImageUploadTicketRecord>(
      buildTicketCacheKey(token),
      {
        shopId: product.shopId,
        productId: product.id,
        storageKey: key,
      },
      UPLOAD_TICKET_TTL_MS,
    );

    return {
      token,
      key,
    };
  }
}

export function buildTicketCacheKey(token: string): string {
  return `upload:ticket:${token}`;
}
