import { Injectable } from '@nestjs/common';
import { toSlug } from '~/common/utils/slugify';
import { err, ok, type Result } from '~/common/application/result';
import { CategoryNotFoundError } from '../../errors/category-app.error';
import { CategoryRepository } from '../../ports/category.repository';
import type { CategorySummary } from '../../category.types';

export interface CreateCategoryAttributeInput {
  categoryId: string;
  key?: string;
  name: string;
  inputType?: string;
  isRequired?: boolean;
  rank?: number;
  options: string[];
}

@Injectable()
export class CreateCategoryAttributeUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(
    input: CreateCategoryAttributeInput
  ): Promise<Result<CategorySummary, CategoryNotFoundError>> {
    const category = await this.categoryRepository.createAttribute({
      categoryId: input.categoryId,
      key: input.key?.trim() || toSlug(input.name).replaceAll('-', '_'),
      name: input.name.trim(),
      inputType: input.inputType?.trim() || undefined,
      isRequired: input.isRequired,
      rank: input.rank,
      options: input.options.map((option, index) => ({
        value: option.trim(),
        rank: index + 1,
      })),
    });

    if (!category) {
      return err(new CategoryNotFoundError());
    }

    return ok(category);
  }
}
