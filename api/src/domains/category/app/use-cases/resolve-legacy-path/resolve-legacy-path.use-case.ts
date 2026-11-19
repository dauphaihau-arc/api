import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import type { StorefrontLanguage } from '~/platform/config/marketplace.config';
import { DEFAULT_STOREFRONT_LANGUAGE } from '~/platform/localization/storefront-language';
import { CategoryNotFoundError } from '../../errors/category-app.error';
import { CategoryRepository } from '../../ports/category.repository';
import type { CategoryResolution } from '../../category.types';

/**
 * Resolve a legacy hierarchical category path to the current category and
 * ordered ancestry. Ownership is permanent and bound to category identity, so
 * the result carries the latest slug and the caller can build the current
 * canonical URL. Malformed, unknown, and unowned paths all resolve to the same
 * not-found result; the resolver never falls back to a parent path.
 */
@Injectable()
export class ResolveLegacyPathUseCase {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  async execute(
    legacyPath: string | undefined,
    language: StorefrontLanguage = DEFAULT_STOREFRONT_LANGUAGE,
  ): Promise<Result<CategoryResolution, CategoryNotFoundError>> {
    if (!legacyPath) {
      return err(new CategoryNotFoundError());
    }

    const resolution = await this.categoryRepository.resolveLegacyPath(
      legacyPath,
      language,
    );

    if (!resolution) {
      return err(new CategoryNotFoundError());
    }

    return ok(resolution);
  }
}
