import { Injectable } from '@nestjs/common';
import { createPublicId } from '~/platform/ids/public-id';
import { err, ok, type Result } from '~/platform/application/result';
import { appJobDeduplicationKey } from '~/platform/jobs/app-job-deduplication';
import { appJobName } from '~/platform/jobs/app-job.names';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { JobDispatcher } from '~/integrations/queue/app/ports/job-dispatcher';
import { buildStorageObjectKey, resolveImageExtension, resolveStorageEnvironmentSegment } from '~/integrations/storage/app/storage-key-builder';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';
import {
  ActorCannotCreateProductDraftError,
  ProductNotFoundError,
} from '../../errors/product-app.error';

export interface UploadedProductImageFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

export interface SetProductImagesInput {
  files: UploadedProductImageFile[];
}

type SetProductImagesError =
  | ActorCannotCreateProductDraftError
  | ProductNotFoundError;

@Injectable()
export class SetProductImagesUseCase {
  constructor(
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
    private readonly productCommandRepository: ProductCommandRepository,
    private readonly shopRepository: ShopRepository,
    private readonly storageService: StorageService,
    private readonly jobDispatcher: JobDispatcher,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: SetProductImagesInput,
  ): Promise<Result<ProductDraftSummary, SetProductImagesError>> {
    const existingProduct = await this.sellerProductQueryRepository.findById(productId);

    if (!existingProduct) {
      return err(new ProductNotFoundError(productId));
    }

    const canManageAnyShop = actor.roles.includes('admin');

    if (!canManageAnyShop) {
      const ownedShop = await this.shopRepository.findOwnedById(
        existingProduct.shopId,
        actor.userId,
      );

      if (!ownedShop) {
        return err(new ActorCannotCreateProductDraftError());
      }
    }

    const uploadedKeys: string[] = [];
    let imagesPersisted = false;

    try {
      const storedImages = await Promise.all(
        input.files.map(async (file, index) => {
          const storedObject = await this.storageService.putObject({
            key: this.buildImageKey(
              existingProduct.shopPublicId ?? existingProduct.shopId,
              existingProduct.publicId ?? existingProduct.id,
              file.mimetype,
            ),
            body: file.buffer,
            contentType: file.mimetype,
          });
          uploadedKeys.push(storedObject.key);

          return {
            storageKey: storedObject.key,
            rank: index + 1,
          };
        }),
      );

      const replacedImages = await this.productCommandRepository.replaceImages({
        productId,
        images: storedImages,
      });

      if (!replacedImages) {
        await this.deleteObjects(uploadedKeys);
        return err(new ProductNotFoundError(productId));
      }

      imagesPersisted = true;

      await this.jobDispatcher.dispatch(
        appJobName.generateProductImageVariants,
        { productId },
        {
          deduplicationKey: appJobDeduplicationKey.generateProductImageVariants(productId),
        },
      );
      await this.jobDispatcher.dispatch(
        appJobName.projectCatalogProduct,
        { productId: replacedImages.product.id },
        {
          deduplicationKey: appJobDeduplicationKey.projectCatalogProduct(
            replacedImages.product.id,
          ),
        },
      );
      await this.deleteObjects(replacedImages.removedStorageKeys);

      return ok(replacedImages.product);
    }
    catch (error) {
      if (!imagesPersisted) {
        await this.deleteObjects(uploadedKeys);
      }
      throw error;
    }
  }

  private buildImageKey(
    shopId: string,
    productId: string,
    contentType: string,
  ): string {
    const imageId = createPublicId();

    return buildStorageObjectKey({
      env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
      visibility: 'public',
      pathSegments: ['shops', shopId, 'products', productId, 'images', imageId],
      extension: resolveImageExtension(contentType),
      filename: 'original',
    });
  }

  private async deleteObjects(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.storageService.deleteObject(key)));
  }
}
