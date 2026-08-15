import type { EntityManager } from '@mikro-orm/postgresql';
import type { StorageService } from '~/integrations/storage/app/ports/storage.service';
import type { ResolvedStorefrontPriceService } from '../../../../app/services/resolved-storefront-price.service';
import type { StorefrontMarketContextService } from '../../../../app/services/storefront-market-context.service';
import { ProductImageVariant } from '../../../../domain/enums/product-image-variant.enum';
import { ProductShippingCharge } from '../../../../domain/enums/product-shipping-charge.enum';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { MikroOrmStorefrontProductQueryRepository } from './mikro-orm-storefront-product-query.repository';

describe('MikroOrmStorefrontProductQueryRepository', () => {
  function buildRepository() {
    const execute = jest.fn();
    const connection = { execute };
    const entityManager = {
      fork: jest.fn(() => ({
        getConnection: () => connection,
      })),
    } as unknown as EntityManager;
    const storageService = {} as StorageService;
    const resolvedStorefrontPriceService = {
      resolveManyForCurrentRequest: jest.fn((inventories) => {
        inventories.forEach((inventory: { updatedAt: Date }) => {
          inventory.updatedAt.toISOString();
        });

        return Promise.resolve(new Map());
      }),
    } as unknown as jest.Mocked<ResolvedStorefrontPriceService>;
    const storefrontMarketContextService = {} as StorefrontMarketContextService;

    return {
      repository: new MikroOrmStorefrontProductQueryRepository(
        entityManager,
        storageService,
        resolvedStorefrontPriceService,
        storefrontMarketContextService,
      ),
      execute,
      resolvedStorefrontPriceService,
    };
  }

  it('normalizes raw inventory timestamps before resolving product-card prices', async () => {
    const { repository, execute, resolvedStorefrontPriceService } = buildRepository();

    execute
      .mockResolvedValueOnce([{
        id: 'product-1',
        category_id: null,
        title: 'Handmade Bag',
        slug: 'handmade-bag',
        variant_type: null,
        created_at: new Date('2026-08-15T00:00:00.000Z'),
        shop_id: 'shop-1',
        shop_public_id: null,
        shop_name: 'Arc Store',
        shop_slug: 'arc-store',
        image_storage_key: 'products/product-1/original.jpg',
        card_image_storage_key: 'products/product-1/card.webp',
        variant_count: 1,
        has_free_shipping: false,
      }])
      .mockResolvedValueOnce([{
        inventory_id: 'inventory-1',
        product_id: 'product-1',
        stock: 3,
        inventory_updated_at: '2026-08-15T13:00:25.336Z',
        price_id: null,
        market_code: null,
        currency: null,
        amount_minor: null,
        original_amount_minor: null,
        active_to: null,
      }]);

    await expect(repository.findPublicCardsByIds(['product-1'])).resolves.toEqual([
      expect.objectContaining({
        id: 'product-1',
        availability: {
          inStock: true,
          lowStock: true,
          stockTotal: 3,
        },
      }),
    ]);
    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      [
        ProductShippingCharge.FREE_SHIPPING,
        ProductImageVariant.CARD_1X1,
        'product-1',
        ProductState.ACTIVE,
      ],
    );
    expect(resolvedStorefrontPriceService.resolveManyForCurrentRequest)
      .toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'inventory-1',
          updatedAt: new Date('2026-08-15T13:00:25.336Z'),
        }),
      ]);
  });
});
