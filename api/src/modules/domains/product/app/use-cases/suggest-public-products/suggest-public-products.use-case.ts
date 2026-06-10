import { Injectable } from '@nestjs/common';
import { ProductRepository } from '../../ports/product.repository';
import type { PublicProductSuggestion } from '../../product.types';

export const PUBLIC_PRODUCT_SUGGESTIONS_DEFAULT_LIMIT = 5;
export const PUBLIC_PRODUCT_SUGGESTIONS_MIN_SEARCH_LENGTH = 2;

@Injectable()
export class SuggestPublicProductsUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

  async execute(
    search: string,
    limit: number = PUBLIC_PRODUCT_SUGGESTIONS_DEFAULT_LIMIT
  ): Promise<PublicProductSuggestion[]> {
    const trimmedSearch = search.trim();

    if (trimmedSearch.length < PUBLIC_PRODUCT_SUGGESTIONS_MIN_SEARCH_LENGTH) {
      return [];
    }

    return this.productRepository.suggestPublic({
      search: trimmedSearch,
      limit,
    });
  }
}
