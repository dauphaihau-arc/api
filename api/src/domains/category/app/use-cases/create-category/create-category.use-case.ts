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
    let parentId: string | undefined;

    if (input.parentId) {
      const parent = await this.categoryRepository.findByPublicId(input.parentId);

      if (!parent) {
        return err(new CategoryNotFoundError());
      }

      parentId = parent.id;
    }

    const category = await this.categoryRepository.create({
      parentId,
      name: input.name.trim(),
      rank: input.rank,
      imageStorageKey: input.imageStorageKey?.trim() || undefined,
    });

    return ok(category);
  }
}
