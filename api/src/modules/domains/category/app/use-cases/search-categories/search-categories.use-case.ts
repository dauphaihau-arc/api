import { Injectable } from '@nestjs/common';
import { CategoryRepository } from '../../ports/category.repository';
import type { CategorySearchSuggestion } from '../../category.types';

export const CATEGORY_SEARCH_DEFAULT_LIMIT = 6;

@Injectable()
export class SearchCategoriesUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(
    name: string,
    limit: number = CATEGORY_SEARCH_DEFAULT_LIMIT
  ): Promise<CategorySearchSuggestion[]> {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return [];
    }

    return this.categoryRepository.searchSuggestions(trimmedName, limit);
  }
}
