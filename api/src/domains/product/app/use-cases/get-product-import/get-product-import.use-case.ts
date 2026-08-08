import { Injectable } from '@nestjs/common';
import { ProductImportNotFoundError } from '../../product-import/product-import.errors';
import {
  ProductImportQueryRepository,
} from '../../ports/product-import-query.repository';
import type { ProductImportSummary } from '../../ports/product-import.types';

@Injectable()
export class GetProductImportUseCase {
  constructor(private readonly productImportQueryRepository: ProductImportQueryRepository) {}

  async execute(shopId: string, importId: string): Promise<ProductImportSummary> {
    const productImport = await this.productImportQueryRepository.findByShopId(shopId, importId);

    if (!productImport) {
      throw new ProductImportNotFoundError(importId);
    }

    return productImport;
  }
}
