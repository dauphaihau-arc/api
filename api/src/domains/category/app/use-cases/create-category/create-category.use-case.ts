import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { CategoryNotFoundError } from '../../errors/category-app.error';
import { CategoryRepository } from '../../ports/category.repository';
import type { CategorySummary } from '../../category.types';

export interface CreateCategoryInput {
  parentId?: string;
  name: string;
  rank: number;
  imageStorageKey?: string;
}

@Injectable()
export class CreateCategoryUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(
    input: CreateCategoryInput,
  ): Promise<Result<CategorySummary, CategoryNotFoundError>> {
    if (input.parentId) {
      const parent = await this.categoryRepository.findById(input.parentId);

      if (!parent) {
        return err(new CategoryNotFoundError());
      }
    }

    const category = await this.categoryRepository.create({
      parentId: input.parentId,
      name: input.name.trim(),
      rank: input.rank,
      imageStorageKey: input.imageStorageKey?.trim() || undefined,
    });

    return ok(category);
  }
}
