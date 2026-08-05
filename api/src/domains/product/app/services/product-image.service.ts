import { Injectable, Logger } from '@nestjs/common';
import { buildStorageObjectKey, resolveStorageEnvironmentSegment } from '~/integrations/storage/app/storage-key-builder';
import { ImageTransformService } from '~/integrations/image-transform/app/ports/image-transform.service';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { PRODUCT_IMAGE_VARIANT_SPECS } from '../config/product-image-variant.config';
import { ProductImageVariantGenerationRepository } from '../ports/product-image-variant-generation.repository';
import { ProductImageVariant } from '../../domain/enums/product-image-variant.enum';
import { ProductImageVariantStatus } from '../../domain/enums/product-image-variant-status.enum';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { ProductImageEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product-image.entity';

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${durationMs.toFixed(0)}ms`;
  }

  return `${(durationMs / 1_000).toFixed(2)}s`;
}

@Injectable()
export class ProductImageService {
  private readonly logger = new Logger(ProductImageService.name);

  constructor(
    private readonly productImageVariantGenerationRepository: ProductImageVariantGenerationRepository,
    private readonly storageService: StorageService,
    private readonly imageTransformService: ImageTransformService,
  ) {}

  async generateVariants(productId: string): Promise<void> {
    const startedAt = performance.now();
    const product = await this.productImageVariantGenerationRepository.findProductForVariantGeneration(
      productId,
    );

    if (!product) {
      return;
    }

    for (const image of product.images.getItems()) {
      image.variantStatus = ProductImageVariantStatus.PROCESSING;
      image.variantError = undefined;
      image.variantsGeneratedAt = undefined;
    }

    const markProcessingStartedAt = performance.now();
    await this.productImageVariantGenerationRepository.flush();
    this.logger.debug(
      `[perf] product ${product.slug} mark-processing flush ${formatDurationMs(performance.now() - markProcessingStartedAt)}`,
    );

    for (const image of product.images.getItems()) {
      try {
        await this.generateVariantsForImage(product, image);
        image.variantStatus = ProductImageVariantStatus.READY;
        image.variantError = undefined;
        image.variantsGeneratedAt = new Date();
      }
      catch (error) {
        image.variantStatus = ProductImageVariantStatus.FAILED;
        image.variantError = error instanceof Error
          ? error.message.slice(0, 1000)
          : 'Unknown variant generation error';
      }
    }

    const finalFlushStartedAt = performance.now();
    await this.productImageVariantGenerationRepository.flush();
    this.logger.debug(
      `[perf] product ${product.slug} final variant flush ${formatDurationMs(performance.now() - finalFlushStartedAt)}`,
    );
    this.logger.debug(
      `[perf] product ${product.slug} total generateVariants ${formatDurationMs(performance.now() - startedAt)}`,
    );
  }

  private async generateVariantsForImage(
    product: ProductEntity,
    image: ProductImageEntity,
  ): Promise<void> {
    const imageStartedAt = performance.now();
    const fetchOriginalStartedAt = performance.now();
    const original = await this.storageService.getObject(image.storageKey);
    const fetchOriginalDurationMs = performance.now() - fetchOriginalStartedAt;
    const generatedKeys: string[] = [];
    const touchedVariants = new Set<ProductImageVariant>();
    let transformDurationMs = 0;
    let uploadDurationMs = 0;
    let staleDeleteDurationMs = 0;

    try {
      for (const [variant, spec] of Object.entries(PRODUCT_IMAGE_VARIANT_SPECS) as Array<
        [ProductImageVariant, (typeof PRODUCT_IMAGE_VARIANT_SPECS)[ProductImageVariant]]
      >) {
        if (!spec) {
          continue;
        }

        const transformStartedAt = performance.now();
        const transformed = await this.imageTransformService.transform(original, spec);
        transformDurationMs += performance.now() - transformStartedAt;
        const key = buildStorageObjectKey({
          env: resolveStorageEnvironmentSegment(process.env.NODE_ENV),
          visibility: 'public',
          pathSegments: [
            'shops',
            product.shop.publicId ?? product.shop.id,
            'products',
            product.publicId ?? product.id,
            'images',
            resolveProductImageStorageId(image.storageKey),
          ],
          extension: spec.format,
          filename: variant,
        });

        const uploadStartedAt = performance.now();
        await this.storageService.putObject({
          key,
          body: transformed,
          contentType: resolveImageVariantContentType(spec.format),
        });
        uploadDurationMs += performance.now() - uploadStartedAt;

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

        const variantEntity = this.productImageVariantGenerationRepository.createVariant({
          image,
          variant,
          storageKey: key,
          width: spec.width,
          height: spec.height,
          format: spec.format,
        });

        image.variants.add(variantEntity);
      }

      const staleVariants = image.variants
        .getItems()
        .filter((variant) => !touchedVariants.has(variant.variant));

      for (const staleVariant of staleVariants) {
        image.variants.remove(staleVariant);
        this.productImageVariantGenerationRepository.removeVariant(staleVariant);
        const staleDeleteStartedAt = performance.now();
        await this.storageService.deleteObject(staleVariant.storageKey);
        staleDeleteDurationMs += performance.now() - staleDeleteStartedAt;
      }

      this.logger.debug(
        `[perf] image ${resolveProductImageStorageId(image.storageKey)} variants=${touchedVariants.size} fetch=${formatDurationMs(fetchOriginalDurationMs)} transform=${formatDurationMs(transformDurationMs)} upload=${formatDurationMs(uploadDurationMs)} stale_delete=${formatDurationMs(staleDeleteDurationMs)} total=${formatDurationMs(performance.now() - imageStartedAt)}`,
      );
    }
    catch (error) {
      await Promise.all(
        generatedKeys.map(async (key) => {
          try {
            await this.storageService.deleteObject(key);
          }
          catch {}
        }),
      );
      throw error;
    }
  }
}

function resolveProductImageStorageId(storageKey: string): string {
  const segments = storageKey.split('/').filter(Boolean);
  const imageId = segments.at(-2);

  if (!imageId) {
    throw new Error(`Unable to resolve product image storage id from key "${storageKey}".`);
  }

  return imageId;
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
