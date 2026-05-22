import type { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { ProductImageVariant } from '../domain/enums/product-image-variant.enum';
import { ProductImageVariantEntity } from './persistence/entities/product-image-variant.entity';
import { ProductImageEntity } from './persistence/entities/product-image.entity';
import { MikroOrmProductRepository } from './mikro-orm-product.repository';

describe('MikroOrmProductRepository image projection', () => {
  function buildRepository() {
    const storageService: jest.Mocked<StorageService> = {
      putObject: jest.fn(),
      getObject: jest.fn(),
      deleteObject: jest.fn(),
      exists: jest.fn(),
      getPublicUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
      ping: jest.fn(),
    };

    const repository = new MikroOrmProductRepository(
      {} as never,
      storageService
    );

    return {
      repository,
      storageService,
    };
  }

  it('prefers the card_1x1 variant for public list images', () => {
    const { repository } = buildRepository();
    const cardVariant = new ProductImageVariantEntity();
    cardVariant.variant = ProductImageVariant.CARD_1X1;
    cardVariant.storageKey = 'products/card_1x1.webp';

    const image = {
      storageKey: 'products/original.jpg',
      rank: 1,
      variants: {
        getItems: () => [cardVariant],
      },
    } as unknown as ProductImageEntity;

    const projected = (repository as any).toPublicListImage(image);

    expect(projected).toEqual({
      storageKey: 'products/card_1x1.webp',
      url: 'https://cdn.example.com/products/card_1x1.webp',
      variant: 'card_1x1',
      variants: {
        card_1x1: {
          storageKey: 'products/card_1x1.webp',
          url: 'https://cdn.example.com/products/card_1x1.webp',
        },
      },
    });
  });

  it('falls back to the original image when no card variant exists', () => {
    const { repository } = buildRepository();
    const image = {
      storageKey: 'products/original.jpg',
      rank: 1,
      variants: {
        getItems: () => [],
      },
    } as unknown as ProductImageEntity;

    const projected = (repository as any).toPublicListImage(image);

    expect(projected).toEqual({
      storageKey: 'products/original.jpg',
      url: 'https://cdn.example.com/products/original.jpg',
      variant: 'original',
    });
  });
});
