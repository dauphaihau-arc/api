import { Injectable } from '@nestjs/common';
import { CategoryRepository } from '../../ports/category.repository';
import type { CategorySuggestion } from '../../category.types';

export const CATEGORY_SUGGESTIONS_DEFAULT_LIMIT = 6;

@Injectable()
export class SuggestCategoriesUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(
    name: string,
    limit: number = CATEGORY_SUGGESTIONS_DEFAULT_LIMIT
  ): Promise<CategorySuggestion[]> {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return [];
    }

    return this.categoryRepository.searchSuggestions(trimmedName, limit);
  }
}
