import { Injectable } from '@nestjs/common';
import { LiveProductInventoryStockRepository } from '../ports/live-product-inventory-stock.repository';
import type { PublicProductDetail } from '../product.types';

@Injectable()
export class LiveProductInventoryStockOverlayService {
  constructor(private readonly liveStockRepository: LiveProductInventoryStockRepository) {}

  async overlayDetail(product: PublicProductDetail): Promise<PublicProductDetail> {
    const inventoryIds = [...new Set(product.inventory.map((inventory) => inventory.id))];

    if (inventoryIds.length === 0) {
      return product;
    }

    const stockByInventoryId = await this.liveStockRepository.findStockByInventoryIds(inventoryIds);

    return {
      ...product,
      inventory: product.inventory.map((inventory) => ({
        ...inventory,
        stock: stockByInventoryId.get(inventory.id) ?? inventory.stock,
      })),
    };
  }
}
