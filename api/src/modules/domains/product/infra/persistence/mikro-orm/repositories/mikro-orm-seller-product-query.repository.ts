import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { buildPaginationMeta } from '~/common/application/pagination';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { SellerProductQueryRepository } from '../app/ports/seller-product-query.repository';
import type {
  ListShopProductsInput,
  ProductDraftSummary,
  ShopProductListResult
} from '../app/product.types';
import { ProductState } from '../domain/enums/product-state.enum';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { toProductDraftSummary } from './product-draft-summary.projector';

@Injectable()
export class MikroOrmSellerProductQueryRepository
implements SellerProductQueryRepository {
  private static readonly summaryPopulate = [
    'shop',
    'category',
    'images',
    'images.variants',
    'attributeValues',
    'attributeValues.categoryAttribute',
    'attributeValues.selectedOption',
    'variants',
    'inventoryRecords',
    'inventoryRecords.productVariant',
    'inventoryRecords.prices',
    'shippingProfiles',
    'shippingProfiles.destinations',
  ] as const;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService
  ) {}

  async findById(id: string): Promise<ProductDraftSummary | null> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const product = await repository.findOne(
      { id },
      {
        populate: [...MikroOrmSellerProductQueryRepository.summaryPopulate],
      }
    );

    return product ? toProductDraftSummary(product, this.storageService) : null;
  }

  async listByShop(
    input: ListShopProductsInput
  ): Promise<ShopProductListResult> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const products = await repository.find(
      {
        shop: input.shopId,
        ...(input.state ? { state: input.state } : {}),
        ...(input.categoryId ? { category: input.categoryId } : {}),
      },
      {
        populate: [...MikroOrmSellerProductQueryRepository.summaryPopulate],
      }
    );

    const normalizedSearch = input.search?.trim().toLowerCase();
    const filteredProducts = products.filter((product) => {
      if (!this.shouldIncludeInShopList(product.state, input.state)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = `${product.title} ${product.slug} ${product.description}`
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });

    const sortedProducts = filteredProducts.sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
    );
    const total = sortedProducts.length;
    const start = (input.page - 1) * input.limit;
    const pagedProducts = sortedProducts.slice(start, start + input.limit);

    return {
      items: pagedProducts.map((product) => toProductDraftSummary(product, this.storageService)),
      meta: buildPaginationMeta(input.page, input.limit, total),
      stateCounts: {
        all: total,
        active: input.state === ProductState.ACTIVE ? total : 0,
        inactive: input.state === ProductState.INACTIVE ? total : 0,
        draft: input.state === ProductState.DRAFT ? total : 0,
      },
    };
  }

  async findByShopIdAndSlug(
    shopId: string,
    slug: string
  ): Promise<ProductDraftSummary | null> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const product = await repository.findOne(
      { shop: shopId, slug },
      {
        populate: [...MikroOrmSellerProductQueryRepository.summaryPopulate],
      }
    );

    return product ? toProductDraftSummary(product, this.storageService) : null;
  }

  private shouldIncludeInShopList(
    productState: ProductState,
    requestedState?: ProductState
  ): boolean {
    if (requestedState) {
      return productState === requestedState;
    }

    return productState !== ProductState.REMOVED;
  }
}
