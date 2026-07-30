import type { ImageTransformService } from '~/integrations/image-transform/app/ports/image-transform.service';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import { ProductImageVariantStatus } from '../../domain/enums/product-image-variant-status.enum';
import { ProductImageVariant } from '../../domain/enums/product-image-variant.enum';
import type { ProductImageVariantGenerationRepository } from '../ports/product-image-variant-generation.repository';
import { ProductImageService } from './product-image.service';

describe('ProductImageService', () => {
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
    const repository: Pick<jest.Mocked<ProductImageVariantGenerationRepository>, 'findProductForVariantGeneration' | 'createVariant' | 'removeVariant' | 'flush'> = {
      findProductForVariantGeneration: jest.fn(),
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
      service: new ProductImageService(
        repository as never,
        storageService,
        imageTransformService as never,
      ),
      repository,
      storageService,
      imageTransformService,
    };
  }

  it('marks images as ready and persists generated variants', async () => {
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
      storageKey: 'env/public/shops/shop-1/products/product-1/images/image-1/original.jpg',
      variantStatus: ProductImageVariantStatus.PENDING,
      variantError: 'old error',
      variantsGeneratedAt: new Date('2026-01-01T00:00:00.000Z'),
      variants: buildCollection(variants),
    };
    const product = {
      id: 'product-1',
      publicId: 'product-pub-1',
      slug: 'linen-dress',
      shop: {
        id: 'shop-1',
        publicId: 'shop-pub-1',
      },
      images: buildCollection([image]),
    };

    repository.findProductForVariantGeneration.mockResolvedValue(product as never);
    repository.createVariant.mockImplementation(({ image: targetImage, ...input }) => ({
      image: targetImage,
      ...input,
    }) as never);

    await service.generateVariants('product-1');

    expect(repository.flush).toHaveBeenCalledTimes(2);
    expect(image.variantStatus).toBe(ProductImageVariantStatus.READY);
    expect(image.variantError).toBeUndefined();
    expect(image.variantsGeneratedAt).toBeInstanceOf(Date);
    expect(existingVariant.storageKey).not.toBe('old-key');
    expect(repository.removeVariant).toHaveBeenCalledWith(staleVariant as never);
    expect(storageService.deleteObject).toHaveBeenCalledWith('stale-key');
  });

  it('cleans up generated objects and marks the image failed when generation errors', async () => {
    const {
      service, repository, storageService, imageTransformService, 
    } = buildDependencies();
    const image = {
      storageKey: 'env/public/shops/shop-1/products/product-1/images/image-1/original.jpg',
      variantStatus: ProductImageVariantStatus.PENDING,
      variantError: undefined,
      variantsGeneratedAt: undefined,
      variants: buildCollection([]),
    };
    const product = {
      id: 'product-1',
      publicId: 'product-pub-1',
      slug: 'linen-dress',
      shop: {
        id: 'shop-1',
        publicId: 'shop-pub-1',
      },
      images: buildCollection([image]),
    };

    repository.findProductForVariantGeneration.mockResolvedValue(product as never);
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

    await service.generateVariants('product-1');

    expect(image.variantStatus).toBe(ProductImageVariantStatus.FAILED);
    expect(image.variantError).toContain('transform failed');
    expect(storageService.deleteObject).toHaveBeenCalledWith(expect.stringContaining('/card_1x1.'));
  });
});
