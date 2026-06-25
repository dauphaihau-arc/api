import { Injectable } from '@nestjs/common';
import { toSlug } from '~/common/utils/slugify';
import { CategoryRepository } from '~/modules/domains/category/app/ports/category.repository';
import { StorefrontProductQueryRepository } from '../../ports/storefront-product-query.repository';
import type { PublicProductDetail } from '../../product.types';

@Injectable()
export class GetPublicProductBySlugsUseCase {
  constructor(
    private readonly productRepository: StorefrontProductQueryRepository,
    private readonly categoryRepository: CategoryRepository,
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

  private async resolveCategoryPath(categoryId: string): Promise<NonNullable<PublicProductDetail['categoryPath']>> {
    const path: NonNullable<PublicProductDetail['categoryPath']> = [];
    const visitedCategoryIds = new Set<string>();
    let currentCategoryId: string | undefined = categoryId;

    while (currentCategoryId && !visitedCategoryIds.has(currentCategoryId)) {
      visitedCategoryIds.add(currentCategoryId);
      const category = await this.categoryRepository.findById(currentCategoryId);

      if (!category) {
        break;
      }

      path.push({
        id: category.id,
        name: category.name,
        slug: toSlug(category.name),
      });
      currentCategoryId = category.parentId;
    }

    return path.reverse();
  }
}
