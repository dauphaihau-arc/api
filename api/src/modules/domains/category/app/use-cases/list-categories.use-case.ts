import { Injectable } from '@nestjs/common';
import { CategoryRepository } from '../ports/category.repository';
import type { CategorySummary } from '../category.types';

@Injectable()
export class ListCategoriesUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(parentId?: string): Promise<CategorySummary[]> {
    return this.categoryRepository.findAllByParentId(parentId);
  }
}
