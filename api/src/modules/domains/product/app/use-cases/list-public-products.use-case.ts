import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { CategoryRepository } from '~/modules/domains/category/app/ports/category.repository';
import { ProductRepository } from '../ports/product.repository';
import type {
  ListPublicProductsInput,
  PublicProductListResult
} from '../product.types';

export interface ListPublicProductsQuery {
  page: number;
  limit: number;
  categoryId?: string;
  search?: string;
  title?: string;
  isDigital?: boolean;
  whoMade?: ListPublicProductsInput['whoMade'];
  order?: ListPublicProductsInput['order'];
}

@Injectable()
export class ListPublicProductsUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository
  ) {}

  async execute(query: ListPublicProductsQuery): Promise<PublicProductListResult> {
    const categoryIds = query.categoryId
      ? await this.resolveCategorySubtreeIds(query.categoryId)
      : undefined;

    const result = await this.productRepository.listPublic({
      page: query.page,
      limit: query.limit,
      categoryIds,
      search: query.search?.trim() || undefined,
      title: query.title?.trim() || undefined,
      isDigital: query.isDigital,
      whoMade: query.whoMade,
      order: query.order,
    });

    return {
      items: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.meta.total),
    };
  }

  private async resolveCategorySubtreeIds(categoryId: string): Promise<string[]> {
    const category = await this.categoryRepository.findById(categoryId);

    if (!category) {
      return [];
    }

    const resolvedIds = new Set<string>([categoryId]);
    const pendingParentIds = [categoryId];

    while (pendingParentIds.length > 0) {
      const parentId = pendingParentIds.shift();

      if (!parentId) {
        continue;
      }

      const children = await this.categoryRepository.findAllByParentId(parentId);

      for (const child of children) {
        if (resolvedIds.has(child.id)) {
          continue;
        }

        resolvedIds.add(child.id);
        pendingParentIds.push(child.id);
      }
    }

    return Array.from(resolvedIds);
  }
}
