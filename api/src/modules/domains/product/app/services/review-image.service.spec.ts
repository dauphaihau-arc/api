import type { ImageTransformService } from '~/modules/shared/image-transform/app/ports/image-transform.service';
import type { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { ProductImageVariant } from '../../domain/enums/product-image-variant.enum';
import { ProductImageVariantStatus } from '../../domain/enums/product-image-variant-status.enum';
import type { ReviewImageVariantGenerationRepository } from '../ports/review-image-variant-generation.repository';
import { ReviewImageService } from './review-image.service';

describe('ReviewImageService', () => {
  function buildCollection<T>(items: T[]) {
    return {
      getItems: () => items,
      add: (item: T) => {
        items.push(item);
      },
      remove: (item: T) => {
        const index = items.indexOf(item);
        if (index >= 0) {
          items.splice(index, 1);
        }
      },
    };
  }

  function buildDependencies() {
    const repository: Pick<jest.Mocked<ReviewImageVariantGenerationRepository>, 'findReviewImageForVariantGeneration' | 'createVariant' | 'removeVariant' | 'flush'> = {
      findReviewImageForVariantGeneration: jest.fn(),
      createVariant: jest.fn(),
      removeVariant: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    };
    const storageService: jest.Mocked<StorageService> = {
      putObject: jest.fn().mockResolvedValue({
        key: 'generated-key',
        size: 3,
        contentType: 'image/webp',
      }),
      getObject: jest.fn().mockResolvedValue(Buffer.from('raw-image')),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn(),
      getPublicUrl: jest.fn(),
      ping: jest.fn().mockResolvedValue(undefined),
    };
    const imageTransformService: Pick<jest.Mocked<ImageTransformService>, 'transform'> = {
      transform: jest.fn().mockResolvedValue(Buffer.from('variant-image')),
    };

    return {
      service: new ReviewImageService(
        repository as never,
        storageService,
        imageTransformService as never,
      ),
      repository,
      storageService,
      imageTransformService,
    };
  }

  it('marks review images as ready and persists generated variants', async () => {
    const { service, repository, storageService } = buildDependencies();
    const existingVariant = {
      variant: ProductImageVariant.CARD_1X1,
      storageKey: 'old-key',
      width: 10,
      height: 10,
      format: 'webp',
    };
    const staleVariant = {
      variant: ProductImageVariant.ORIGINAL,
      storageKey: 'stale-key',
      width: 10,
      height: 10,
      format: 'webp',
    };
    const variants = [existingVariant, staleVariant];
    const image = {
      id: 'review-image-1',
      storageKey: 'dev/public/users/user-1/products/item-1/images/product-reviews/image-1/original.jpg',
      variantStatus: ProductImageVariantStatus.PENDING,
      variantError: 'old error',
      variantsGeneratedAt: new Date('2026-01-01T00:00:00.000Z'),
      variants: buildCollection(variants),
    };

    repository.findReviewImageForVariantGeneration.mockResolvedValue(image as never);
    repository.createVariant.mockImplementation(({ image: targetImage, ...input }) => ({
      image: targetImage,
      ...input,
    }) as never);

    await service.generateVariants('review-image-1');

    expect(repository.flush).toHaveBeenCalledTimes(2);
    expect(image.variantStatus).toBe(ProductImageVariantStatus.READY);
    expect(image.variantError).toBeUndefined();
    expect(image.variantsGeneratedAt).toBeInstanceOf(Date);
    expect(existingVariant.storageKey).toContain('/card_1x1.');
    expect(repository.removeVariant).toHaveBeenCalledWith(staleVariant as never);
    expect(storageService.deleteObject).toHaveBeenCalledWith('stale-key');
  });

  it('cleans up generated objects and marks the review image failed when generation errors', async () => {
    const {
      service, repository, storageService, imageTransformService, 
    } = buildDependencies();
    const image = {
      id: 'review-image-1',
      storageKey: 'dev/public/users/user-1/products/item-1/images/product-reviews/image-1/original.jpg',
      variantStatus: ProductImageVariantStatus.PENDING,
      variantError: undefined,
      variantsGeneratedAt: undefined,
      variants: buildCollection([]),
    };

    repository.findReviewImageForVariantGeneration.mockResolvedValue(image as never);
    let transformCalls = 0;
    imageTransformService.transform.mockImplementation(async () => {
      transformCalls += 1;
      if (transformCalls > 1) {
        throw new Error('transform failed');
      }

      return Buffer.from('variant-image');
    });
    repository.createVariant.mockImplementation(({ image: targetImage, ...input }) => ({
      image: targetImage,
      ...input,
    }) as never);

    await service.generateVariants('review-image-1');

    expect(image.variantStatus).toBe(ProductImageVariantStatus.FAILED);
    expect(image.variantError).toContain('transform failed');
    expect(storageService.deleteObject).toHaveBeenCalledWith(expect.stringContaining('/card_1x1.'));
  });
});
