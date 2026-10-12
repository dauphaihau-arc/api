import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { isCategoryPublicId } from '../../category-public-id';
import { CategoryNotFoundError } from '../../errors/category-app.error';
import { CategoryRepository } from '../../ports/category.repository';
import type { CategoryResolution } from '../../category.types';

/**
 * Authoritative storefront category resolution: maps a public identity to the
 * current category plus its ordered root-to-current ancestry. Malformed or
 * out-of-range identities are rejected before persistence; unknown and
 * unavailable categories resolve to the same not-found result.
 */
@Injectable()
export class ResolveCategoryUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(
    publicId: string,
  ): Promise<Result<CategoryResolution, CategoryNotFoundError>> {
    if (!isCategoryPublicId(publicId)) {
      return err(new CategoryNotFoundError());
    }

    const resolution = await this.categoryRepository.resolveByPublicId(publicId);

    if (!resolution) {
      return err(new CategoryNotFoundError());
    }

    return ok(resolution);
  }
}
