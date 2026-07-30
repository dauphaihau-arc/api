import { Injectable, Logger } from '@nestjs/common';
import { ImageTransformService } from '~/integrations/image-transform/app/ports/image-transform.service';
import { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ProductImageVariant } from '../../domain/enums/product-image-variant.enum';
import { ProductImageVariantStatus } from '../../domain/enums/product-image-variant-status.enum';
import { REVIEW_IMAGE_VARIANT_SPECS } from '../config/review-image-variant.config';
import { ReviewImageVariantGenerationRepository } from '../ports/review-image-variant-generation.repository';
import type { ProductReviewImageEntity } from '../../infra/persistence/mikro-orm/entities/product-review-image.entity';

@Injectable()
export class ReviewImageService {
  private readonly logger = new Logger(ReviewImageService.name);

  constructor(
    private readonly reviewImageVariantGenerationRepository: ReviewImageVariantGenerationRepository,
    private readonly storageService: StorageService,
    private readonly imageTransformService: ImageTransformService,
  ) {}

  async generateVariants(reviewImageId: string): Promise<void> {
    const image = await this.reviewImageVariantGenerationRepository.findReviewImageForVariantGeneration(
      reviewImageId,
    );

    if (!image) {
      return;
    }

    image.variantStatus = ProductImageVariantStatus.PROCESSING;
    image.variantError = undefined;
    image.variantsGeneratedAt = undefined;
    await this.reviewImageVariantGenerationRepository.flush();

    try {
      await this.generateVariantsForImage(image);
      image.variantStatus = ProductImageVariantStatus.READY;
      image.variantError = undefined;
      image.variantsGeneratedAt = new Date();
    }
    catch (error) {
      image.variantStatus = ProductImageVariantStatus.FAILED;
      image.variantError = error instanceof Error
        ? error.message.slice(0, 1000)
        : 'Unknown variant generation error';
      this.logger.error(
        `Failed review image variant generation for ${reviewImageId}: ${image.variantError}`,
      );
    }

    await this.reviewImageVariantGenerationRepository.flush();
  }

  private async generateVariantsForImage(
    image: ProductReviewImageEntity,
  ): Promise<void> {
    const original = await this.storageService.getObject(image.storageKey);
    const generatedKeys: string[] = [];
    const touchedVariants = new Set<ProductImageVariant>();

    try {
      for (const [variant, spec] of Object.entries(REVIEW_IMAGE_VARIANT_SPECS) as Array<
        [ProductImageVariant, (typeof REVIEW_IMAGE_VARIANT_SPECS)[ProductImageVariant]]
      >) {
        if (!spec) {
          continue;
        }

        const transformed = await this.imageTransformService.transform(original, spec);
        const key = resolveReviewImageVariantStorageKey(image.storageKey, variant, spec.format);

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

        const variantEntity = this.reviewImageVariantGenerationRepository.createVariant({
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
        this.reviewImageVariantGenerationRepository.removeVariant(staleVariant);
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
        }),
      );
      throw error;
    }
  }
}

function resolveReviewImageVariantStorageKey(
  storageKey: string,
  variant: ProductImageVariant,
  format: 'webp' | 'jpg' | 'png' | 'avif',
): string {
  const lastSlashIndex = storageKey.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    throw new Error(`Unable to derive review image variant key from "${storageKey}".`);
  }

  return `${storageKey.slice(0, lastSlashIndex + 1)}${variant}.${format}`;
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
