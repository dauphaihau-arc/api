import type { ResolvedImportCategory } from './product-import.types';

export abstract class ProductImportValidationQueryRepository {
  abstract resolveCategoryPath(path: string): Promise<ResolvedImportCategory[]>;
  abstract skuExists(shopId: string, sku: string): Promise<boolean>;
}
