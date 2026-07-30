import { ProductState } from '../../../../domain/enums/product-state.enum';
import type { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import type { CatalogProductSlugDocument } from '../../../../app/ports/catalog-product-slug.repository';

export function toCatalogProductSlugDocument(
  product: ProductEntity,
): CatalogProductSlugDocument {
  return {
    _id: `${product.shop.slug}::${product.slug}`,
    shopSlug: product.shop.slug,
    productSlug: product.slug,
    productId: product.id,
    shopId: product.shop.id,
    state: ProductState.ACTIVE,
    updatedAt: product.updatedAt,
  };
}
