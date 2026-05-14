import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/common/application/result';
import { CategoryNotFoundError } from '../../errors/category-app.error';
import { CategoryRepository } from '../../ports/category.repository';
import type { CategoryAttributeSummary } from '../../category.types';

@Injectable()
export class GetCategoryAttributesUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(
    categoryId: string
  ): Promise<Result<CategoryAttributeSummary[], CategoryNotFoundError>> {
    const category = await this.categoryRepository.findById(categoryId);

    if (!category) {
      return err(new CategoryNotFoundError());
    }

    return ok(category.attributes);
  }
}
