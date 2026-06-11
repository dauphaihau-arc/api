import type { ProductState } from '../../domain/enums/product-state.enum';

export interface CatalogProductSlugDocument {
  _id: string;
  shopSlug: string;
  productSlug: string;
  productId: string;
  shopId: string;
  state: ProductState;
  updatedAt: Date;
}

export abstract class CatalogProductSlugRepository {
  abstract ping(): Promise<void>;

  abstract findProductIdByShopAndSlug(
    shopSlug: string,
    productSlug: string
  ): Promise<string | null>;

  abstract upsert(document: CatalogProductSlugDocument): Promise<void>;

  abstract deleteByProductId(productId: string): Promise<void>;
}
