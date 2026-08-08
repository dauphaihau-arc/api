import type {
  ProductImportRowResult,
  ProductImportSummary,
} from './product-import.types';

export abstract class ProductImportQueryRepository {
  abstract findByShopId(shopId: string, importId: string): Promise<ProductImportSummary | undefined>;
  abstract findForProcessing(importId: string): Promise<ProductImportSummary | undefined>;
  abstract listRows(importId: string): Promise<ProductImportRowResult[]>;
}
