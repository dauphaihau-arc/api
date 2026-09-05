import type { LiveProductInventoryStockRepository } from '../ports/live-product-inventory-stock.repository';
import { ProductVariantType } from '../../domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '../../domain/enums/product-who-made.enum';
import type { PublicProductDetail } from '../product.types';
import { LiveProductInventoryStockOverlayService } from './live-product-inventory-stock-overlay.service';

describe('LiveProductInventoryStockOverlayService', () => {
  it('overlays stale catalog stock with live inventory stock', async () => {
    const liveStockRepository = {
      findStockByInventoryIds: jest.fn().mockResolvedValue(new Map([
        ['inventory-1', 0],
        ['inventory-2', 3],
      ])),
    } as unknown as jest.Mocked<LiveProductInventoryStockRepository>;

    const service = new LiveProductInventoryStockOverlayService(liveStockRepository);
    const product = buildProductDetail({
      inventory: [
        { id: 'inventory-1', stock: 1, sku: 'SKU-1' },
        { id: 'inventory-2', stock: 1, sku: 'SKU-2' },
      ],
    });

    const result = await service.overlayDetail(product);

    expect(result.inventory).toEqual([
      expect.objectContaining({ id: 'inventory-1', stock: 0, sku: 'SKU-1' }),
      expect.objectContaining({ id: 'inventory-2', stock: 3, sku: 'SKU-2' }),
    ]);
    expect(product.inventory[0].stock).toBe(1);
    expect(liveStockRepository.findStockByInventoryIds).toHaveBeenCalledWith([
      'inventory-1',
      'inventory-2',
    ]);
  });

  it('keeps catalog stock when live inventory row is missing', async () => {
    const liveStockRepository = {
      findStockByInventoryIds: jest.fn().mockResolvedValue(new Map([
        ['inventory-1', 0],
      ])),
    } as unknown as jest.Mocked<LiveProductInventoryStockRepository>;

    const service = new LiveProductInventoryStockOverlayService(liveStockRepository);
    const product = buildProductDetail({
      inventory: [
        { id: 'inventory-1', stock: 1 },
        { id: 'inventory-missing', stock: 7 },
      ],
    });

    const result = await service.overlayDetail(product);

    expect(result.inventory.map((inventory) => ({
      id: inventory.id,
      stock: inventory.stock,
    }))).toEqual([
      { id: 'inventory-1', stock: 0 },
      { id: 'inventory-missing', stock: 7 },
    ]);
  });
});

function buildProductDetail(
  input: Pick<PublicProductDetail, 'inventory'>,
): PublicProductDetail {
  return {
    id: 'product-1',
    shop: {
      id: 'shop-1',
      shopName: 'Shop',
      slug: 'shop',
    },
    title: 'Product',
    slug: 'product',
    description: 'Product description',
    whoMade: ProductWhoMade.I_DID,
    isDigital: false,
    variantType: ProductVariantType.SINGLE,
    stockNoticeThreshold: 10,
    reviewSummary: {
      average: 0,
      count: 0,
    },
    images: [],
    variants: [],
    inventory: input.inventory,
  };
}
