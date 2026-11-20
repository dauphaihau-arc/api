import type {
  ListPublicProductsInput,
  PublicProductDetail,
  PublicProductFacet,
  PublicProductListItem,
  PublicProductListResult,
  PublicProductSuggestion,
  SuggestPublicProductsInput,
} from '../../app/product.types';
import type { StorefrontProductQueryRepository } from '../../app/ports/storefront-product-query.repository';
import type { PublicProductLocalizationService } from '../../app/services/public-product-localization.service';

/**
 * Applies Localized Content to every public product read while leaving the
 * underlying catalog adapter unaware of language. Each delegation performs at
 * most one batched translation lookup, never one per row.
 */
export class LocalizedStorefrontProductQueryRepository
implements StorefrontProductQueryRepository {
  constructor(
    private readonly delegate: StorefrontProductQueryRepository,
    private readonly localizationService: PublicProductLocalizationService,
  ) {}

  async findPublicByShopSlugAndProductSlug(
    shopSlug: string,
    productSlug: string,
  ): Promise<PublicProductDetail | null> {
    const product = await this.delegate.findPublicByShopSlugAndProductSlug(
      shopSlug,
      productSlug,
    );

    return product
      ? this.localizationService.localizeProductDetail(product)
      : null;
  }

  async findPublicByIds(productIds: string[]): Promise<PublicProductListItem[]> {
    return this.localizationService.localizeProductCards(
      await this.delegate.findPublicByIds(productIds),
    );
  }

  async findPublicCardsByIds(
    productIds: string[],
  ): Promise<PublicProductListItem[]> {
    return this.localizationService.localizeProductCards(
      await this.delegate.findPublicCardsByIds(productIds),
    );
  }

  async listPublic(
    input: ListPublicProductsInput,
  ): Promise<PublicProductListResult> {
    const result = await this.delegate.listPublic(input);

    return {
      ...result,
      items: await this.localizationService.localizeProductCards(result.items),
    };
  }

  listPublicFacets(
    input: ListPublicProductsInput,
  ): Promise<PublicProductFacet[]> {
    return this.delegate.listPublicFacets(input);
  }

  async suggestPublic(
    input: SuggestPublicProductsInput,
  ): Promise<PublicProductSuggestion[]> {
    return this.localizationService.localizeProductCards(
      await this.delegate.suggestPublic(input),
    );
  }
}
