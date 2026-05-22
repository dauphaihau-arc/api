import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { buildStorageObjectKey, resolveStorageEnvironmentSegment } from '~/modules/shared/storage/app/storage-key-builder';
import { ImageTransformService } from '~/modules/shared/image/app/ports/image-transform.service';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { PRODUCT_IMAGE_VARIANT_SPECS } from '../config/product-image-variant.config';
import { ProductImageVariant } from '../../domain/enums/product-image-variant.enum';
import { ProductImageVariantEntity } from '../../infra/persistence/entities/product-image-variant.entity';
import { ProductEntity } from '../../infra/persistence/entities/product.entity';
import type { ProductImageEntity } from '../../infra/persistence/entities/product-image.entity';

@Injectable()
export class ProductImageService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
    private readonly imageTransformService: ImageTransformService
  ) {}

  async generateVariants(productId: string): Promise<void> {
    const entityManager = this.entityManager.fork();
    const product = await entityManager.getRepository(ProductEntity).findOne(
      { id: productId },
      {
        populate: ['shop', 'images', 'images.variants'],
      }
    );

    if (!product) {
      return;
    }

    for (const image of product.images.getItems()) {
      await this.generateVariantsForImage(entityManager, product, image);
    }

    await entityManager.flush();
  }

  private async generateVariantsForImage(
    entityManager: EntityManager,
    product: ProductEntity,
    image: ProductImageEntity
  ): Promise<void> {
    const original = await this.storageService.getObject(image.storageKey);
    const generatedKeys: string[] = [];
    const touchedVariants = new Set<ProductImageVariant>();

    try {
      for (const [variant, spec] of Object.entries(PRODUCT_IMAGE_VARIANT_SPECS) as Array<
        [ProductImageVariant, (typeof PRODUCT_IMAGE_VARIANT_SPECS)[ProductImageVariant]]
      >) {
        if (!spec) {
          continue;
        }

        const transformed = await this.imageTransformService.transform(original, spec);
        const key = buildStorageObjectKey({
          env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
          visibility: 'public',
          path: [
            { domain: 'shops', id: product.shop.publicId ?? product.shop.id },
            { domain: 'products', id: product.publicId ?? product.id },
          ],
          collection: 'images',
          assetSegment: variant,
          extension: spec.format,
          filename: image.id,
        });

        await this.storageService.putObject({
          key,
          body: transformed,
          contentType: resolveImageVariantContentType(spec.format),
        });

        generatedKeys.push(key);
        touchedVariants.add(variant);

        const existingVariant = image.variants
          .getItems()
          .find((candidate) => candidate.variant === variant);

        if (existingVariant) {
          existingVariant.storageKey = key;
          existingVariant.width = spec.width;
          existingVariant.height = spec.height;
          existingVariant.format = spec.format;
          continue;
        }

        const variantEntity = entityManager.create(ProductImageVariantEntity, {
          image,
          variant,
          storageKey: key,
          width: spec.width,
          height: spec.height,
          format: spec.format,
        });

        image.variants.add(variantEntity);
        entityManager.persist(variantEntity);
      }

      const staleVariants = image.variants
        .getItems()
        .filter((variant) => !touchedVariants.has(variant.variant));

      for (const staleVariant of staleVariants) {
        image.variants.remove(staleVariant);
        entityManager.remove(staleVariant);
        await this.storageService.deleteObject(staleVariant.storageKey);
      }
    }
    catch (error) {
      await Promise.all(
        generatedKeys.map(async (key) => {
          try {
            await this.storageService.deleteObject(key);
          }
          catch {}
        })
      );
      throw error;
    }
  }
}

function resolveImageVariantContentType(format: 'webp' | 'jpg' | 'png' | 'avif'): string {
  switch (format) {
    case 'webp':
      return 'image/webp';
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'avif':
      return 'image/avif';
  }
}
