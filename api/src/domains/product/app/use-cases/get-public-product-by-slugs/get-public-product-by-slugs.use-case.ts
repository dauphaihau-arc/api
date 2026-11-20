import { Injectable } from '@nestjs/common';
import { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import { StorefrontProductQueryRepository } from '../../ports/storefront-product-query.repository';
import type { PublicProductDetail } from '../../product.types';
import { PublicProductLocalizationService } from '../../services/public-product-localization.service';

@Injectable()
export class GetPublicProductBySlugsUseCase {
  constructor(
    private readonly productRepository: StorefrontProductQueryRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly localizationService: PublicProductLocalizationService,
  ) {}

  async execute(
    shopSlug: string,
    productSlug: string,
  ): Promise<PublicProductDetail | null> {
    const product = await this.productRepository.findPublicByShopSlugAndProductSlug(
      shopSlug,
      productSlug,
    );

    if (!product?.categoryId) {
      return product;
    }

    return {
      ...product,
      categoryPath: await this.resolveCategoryPath(product.categoryId),
    };
  }

  private async resolveCategoryPath(
    categoryId: string,
  ): Promise<NonNullable<PublicProductDetail['categoryPath']>> {
    const language = this.localizationService.getStorefrontLanguage();
    const path: NonNullable<PublicProductDetail['categoryPath']> = [];
    const visitedCategoryIds = new Set<string>();
    let currentCategoryId: string | undefined = categoryId;

    while (currentCategoryId && !visitedCategoryIds.has(currentCategoryId)) {
      visitedCategoryIds.add(currentCategoryId);
      const category = await this.categoryRepository.findById(
        currentCategoryId,
        language,
      );

      if (!category) {
        break;
      }

      path.push({
        id: category.publicId,
        name: category.name,
        slug: category.slug,
      });
      currentCategoryId = category.parentId;
    }

    return path.reverse();
  }
}
