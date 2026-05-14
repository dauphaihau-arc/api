import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { randomUUID } from 'node:crypto';
import {
  STORAGE_CONFIG,
  type StorageConfig
} from '~/config/storage.config';
import { createPublicId } from '~/common/ids/public-id';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { buildStorageObjectKey, resolveImageExtension, resolveStorageEnvironmentSegment } from '~/modules/shared/storage/app/storage-key-builder';
import type { StorageAssetType } from '~/modules/shared/storage/app/storage-key.types';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { ProductRepository } from '../../ports/product.repository';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';

const UPLOAD_TICKET_TTL_MS = 15 * 60 * 1000;

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
    private readonly shopRepository: ShopRepository,
    private readonly productRepository: ProductRepository,
    @Inject(STORAGE_CONFIG) private readonly storageConfig: StorageConfig,
    private readonly storageService: StorageService
  ) {}

  async execute(
    actor: AuthenticatedUser,
    shopId: string,
    productId: string,
    contentType: string,
    assetType: StorageAssetType
  ): Promise<IssueProductImageUploadUrlResult> {
    const product = await this.productRepository.findById(productId);

    if (!product || product.shopId !== shopId) {
      throw new NotFoundException('Product was not found');
    }

    await this.assertActorCanManageShop(actor, shopId);

    if (!contentType.startsWith('image/')) {
      throw new BadRequestException('Upload content type must be an image');
    }

    const extension = resolveImageExtension(contentType);
    const shopStorageId = product.shopPublicId ?? product.shopId;
    const productStorageId = product.publicId ?? product.id;
    const key = buildStorageObjectKey({
      env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
      visibility: 'public',
      path: [
        { domain: 'shops', id: shopStorageId },
        { domain: 'products', id: productStorageId },
      ],
      collection: 'images',
      assetType,
      extension,
      filename: createPublicId(),
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
        }
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
        shopId,
        productId,
        storageKey: key,
      },
      UPLOAD_TICKET_TTL_MS
    );

    return {
      token,
      key,
    };
  }

  private async assertActorCanManageShop(
    actor: AuthenticatedUser,
    shopId: string
  ): Promise<void> {
    if (actor.roles.includes('admin')) {
      const shop = await this.shopRepository.findById(shopId);

      if (!shop) {
        throw new NotFoundException('Shop was not found');
      }

      return;
    }

    const shop = await this.shopRepository.findOwnedById(shopId, actor.userId);

    if (!shop) {
      throw new ForbiddenException(
        'Actor is not allowed to upload files for this shop'
      );
    }
  }
}

export function buildTicketCacheKey(token: string): string {
  return `upload:ticket:${token}`;
}
