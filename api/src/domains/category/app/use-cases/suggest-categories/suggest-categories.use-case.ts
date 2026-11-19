import { Injectable } from '@nestjs/common';
import type { StorefrontLanguage } from '~/platform/config/marketplace.config';
import { DEFAULT_STOREFRONT_LANGUAGE } from '~/platform/localization/storefront-language';
import { CategoryRepository } from '../../ports/category.repository';
import type { CategorySuggestion } from '../../category.types';

export const CATEGORY_SUGGESTIONS_DEFAULT_LIMIT = 6;

@Injectable()
export class SuggestCategoriesUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(
    name: string,
    limit: number = CATEGORY_SUGGESTIONS_DEFAULT_LIMIT,
    language: StorefrontLanguage = DEFAULT_STOREFRONT_LANGUAGE,
  ): Promise<CategorySuggestion[]> {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return [];
    }

    return this.categoryRepository.searchSuggestions(
      trimmedName,
      limit,
      language,
    );
  }
}
