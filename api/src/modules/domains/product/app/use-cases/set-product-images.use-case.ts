import { Injectable } from '@nestjs/common';
import { createPublicId } from '~/common/ids/public-id';
import { err, ok, type Result } from '~/common/application/result';
import type { AuthenticatedUser } from '~/modules/domains/auth/app/auth.types';
import { ShopRepository } from '~/modules/domains/shop/app/ports/shop.repository';
import { buildStorageObjectKey, resolveImageExtension, resolveStorageEnvironmentSegment } from '~/modules/shared/storage/app/storage-key-builder';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { ProductRepository } from '../ports/product.repository';
import type { ProductDraftSummary } from '../product.types';
import {
  ActorCannotCreateProductDraftError,
  ProductNotFoundError
} from '../errors/product-app.error';

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
    private readonly productRepository: ProductRepository,
    private readonly shopRepository: ShopRepository,
    private readonly storageService: StorageService
  ) {}

  async execute(
    actor: AuthenticatedUser,
    productId: string,
    input: SetProductImagesInput
  ): Promise<Result<ProductDraftSummary, SetProductImagesError>> {
    const existingProduct = await this.productRepository.findById(productId);

    if (!existingProduct) {
      return err(new ProductNotFoundError(productId));
    }

    const canManageAnyShop = actor.roles.includes('admin');

    if (!canManageAnyShop) {
      const ownedShop = await this.shopRepository.findOwnedById(
        existingProduct.shopId,
        actor.userId
      );

      if (!ownedShop) {
        return err(new ActorCannotCreateProductDraftError());
      }
    }

    const uploadedKeys: string[] = [];

    try {
      const storedImages = await Promise.all(
        input.files.map(async (file, index) => {
          const storedObject = await this.storageService.putObject({
            key: this.buildImageKey(
              existingProduct.shopPublicId ?? existingProduct.shopId,
              existingProduct.publicId ?? existingProduct.id,
              file.mimetype
            ),
            body: file.buffer,
            contentType: file.mimetype,
          });
          uploadedKeys.push(storedObject.key);

          return {
            storageKey: storedObject.key,
            rank: index + 1,
          };
        })
      );

      const replacedImages = await this.productRepository.replaceImages({
        productId,
        images: storedImages,
      });

      if (!replacedImages) {
        await this.deleteObjects(uploadedKeys);
        return err(new ProductNotFoundError(productId));
      }

      await this.deleteObjects(replacedImages.removedStorageKeys);

      return ok(replacedImages.product);
    }
    catch (error) {
      await this.deleteObjects(uploadedKeys);
      throw error;
    }
  }

  private buildImageKey(
    shopId: string,
    productId: string,
    contentType: string
  ): string {
    return buildStorageObjectKey({
      env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
      visibility: 'public',
      path: [
        { domain: 'shops', id: shopId },
        { domain: 'products', id: productId },
      ],
      collection: 'images',
      assetType: 'original',
      extension: resolveImageExtension(contentType),
      filename: createPublicId(),
    });
  }

  private async deleteObjects(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.storageService.deleteObject(key)));
  }
}
