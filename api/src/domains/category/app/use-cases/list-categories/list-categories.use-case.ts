import { Injectable } from '@nestjs/common';
import { CategoryRepository } from '../../ports/category.repository';
import type { CategorySummary } from '../../category.types';

@Injectable()
export class ListCategoriesUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(parentPublicId?: string): Promise<CategorySummary[]> {
    if (!parentPublicId) {
      return this.categoryRepository.findAllByParentId();
    }

    const parent = await this.categoryRepository.findByPublicId(parentPublicId);

    if (!parent) {
      return [];
    }

    return this.categoryRepository.findAllByParentId(parent.id);
  }
}
