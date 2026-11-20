import { Injectable } from '@nestjs/common';
import type { StorefrontLanguage } from '~/platform/config/marketplace.config';
import { DEFAULT_STOREFRONT_LANGUAGE } from '~/platform/localization/storefront-language';
import { CategoryRepository } from '../../ports/category.repository';
import type { CategorySummary } from '../../category.types';

@Injectable()
export class ListCategoriesUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(
    parentPublicId?: string,
    language: StorefrontLanguage = DEFAULT_STOREFRONT_LANGUAGE,
  ): Promise<CategorySummary[]> {
    if (!parentPublicId) {
      return this.categoryRepository.findAllByParentId(undefined, language);
    }

    const parent = await this.categoryRepository.findByPublicId(
      parentPublicId,
      language,
    );

    if (!parent) {
      return [];
    }

    return this.categoryRepository.findAllByParentId(parent.id, language);
  }
}
