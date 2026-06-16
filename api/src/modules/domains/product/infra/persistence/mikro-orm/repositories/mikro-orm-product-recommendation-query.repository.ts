import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { StorageService } from '~/modules/shared/storage/app/ports/storage.service';
import { ProductRecommendationQueryRepository } from '../../../../app/ports/product-recommendation-query.repository';
import type {
  ListPublicProductsByShopSlugInput,
  PublicProductListItem,
  RecommendPublicProductsInput
} from '../../../../app/product.types';
import { compareRecommendationCandidates } from '../../../../app/services/public-product-recommendation-scoring';
import { ResolvedStorefrontPriceService } from '../../../../app/services/resolved-storefront-price.service';
import { ProductState } from '../../../../domain/enums/product-state.enum';
import { ProductInventoryEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product-inventory.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import {
  getPrimaryInventory,
  toPublicProductListItem
} from '../../../projection/storefront-product.projector';

@Injectable()
export class MikroOrmProductRecommendationQueryRepository
implements ProductRecommendationQueryRepository {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly storageService: StorageService,
    private readonly resolvedStorefrontPriceService: ResolvedStorefrontPriceService
  ) {}

  async listPublicByShopSlug(
    input: ListPublicProductsByShopSlugInput
  ): Promise<PublicProductListItem[]> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const products = await repository.find(
      {
        state: ProductState.ACTIVE,
        slug: input.excludeProductSlug
          ? { $ne: input.excludeProductSlug }
          : undefined,
        shop: {
          slug: input.shopSlug,
        },
      },
      {
        populate: this.getRecommendationPopulate(),
        orderBy: {
          createdAt: 'desc',
        },
        limit: Math.max(input.limit * 3, input.limit),
      }
    );

    const visibleProducts = products
      .filter((product) => this.shouldIncludeInPublicList(product))
      .slice(0, input.limit);

    return Promise.all(
      visibleProducts.map((product) => toPublicProductListItem(product, {
        resolvePricing: (inventory) => this.getResolvedPublicPricing(inventory),
        storageService: this.storageService,
      }))
    );
  }

  async recommendSimilarPublic(
    input: RecommendPublicProductsInput
  ): Promise<PublicProductListItem[]> {
    const repository = this.entityManager.fork().getRepository(ProductEntity);
    const anchor = await repository.findOne(
      {
        slug: input.productSlug,
        state: ProductState.ACTIVE,
        shop: {
          slug: input.shopSlug,
        },
      },
      {
        populate: this.getRecommendationPopulate(),
      }
    );

    if (!anchor || !this.shouldIncludeInPublicList(anchor)) {
      return [];
    }

    const candidates = await this.findRecommendationCandidates(repository, anchor, input.limit);
    const anchorScorable = await this.toRecommendationScorableProduct(anchor);
    const scoredCandidates = await Promise.all(
      candidates
        .filter((product) => this.shouldIncludeInPublicList(product))
        .map(async (product) => ({
          product,
          scorable: await this.toRecommendationScorableProduct(product),
        }))
    );

    const orderedProducts = scoredCandidates
      .sort((left, right) => compareRecommendationCandidates(
        anchorScorable,
        left.scorable,
        right.scorable
      ))
      .slice(0, input.limit)
      .map(({ product }) => product);

    return Promise.all(
      orderedProducts.map((product) => toPublicProductListItem(product, {
        resolvePricing: (inventory) => this.getResolvedPublicPricing(inventory),
        storageService: this.storageService,
      }))
    );
  }

  private shouldIncludeInPublicList(product: ProductEntity): boolean {
    return product.state === ProductState.ACTIVE && product.images.getItems().length > 0;
  }

  private async findRecommendationCandidates(
    repository: EntityRepository<ProductEntity>,
    anchor: ProductEntity,
    limit: number
  ): Promise<ProductEntity[]> {
    const candidates = new Map<string, ProductEntity>();
    const targetPoolSize = Math.max(limit * 4, 24);

    if (anchor.category?.id) {
      const sameCategory = await repository.find(
        {
          state: ProductState.ACTIVE,
          id: { $ne: anchor.id },
          category: anchor.category.id,
        },
        {
          limit: targetPoolSize,
          orderBy: {
            views: 'desc',
            createdAt: 'desc',
          },
          populate: this.getRecommendationPopulate(),
        }
      );

      sameCategory.forEach((product) => candidates.set(product.id, product));
    }

    if (candidates.size < targetPoolSize) {
      const relatedByShape = await repository.find(
        {
          state: ProductState.ACTIVE,
          id: { $ne: anchor.id },
          whoMade: anchor.whoMade,
          isDigital: anchor.isDigital,
        },
        {
          limit: targetPoolSize,
          orderBy: {
            views: 'desc',
            createdAt: 'desc',
          },
          populate: this.getRecommendationPopulate(),
        }
      );

      relatedByShape.forEach((product) => candidates.set(product.id, product));
    }

    if (candidates.size < targetPoolSize) {
      const fallback = await repository.find(
        {
          state: ProductState.ACTIVE,
          id: { $ne: anchor.id },
        },
        {
          limit: targetPoolSize,
          orderBy: {
            views: 'desc',
            createdAt: 'desc',
          },
          populate: this.getRecommendationPopulate(),
        }
      );

      fallback.forEach((product) => candidates.set(product.id, product));
    }

    return Array.from(candidates.values());
  }

  private getRecommendationPopulate() {
    return [
      'shop',
      'category',
      'images',
      'images.variants',
      'variants',
      'inventoryRecords',
      'inventoryRecords.prices',
      'inventoryRecords.productVariant',
      'shippingProfiles',
      'shippingProfiles.destinations',
      'attributeValues',
      'attributeValues.categoryAttribute',
      'attributeValues.selectedOption',
    ] as const;
  }

  private async toRecommendationScorableProduct(product: ProductEntity) {
    return {
      id: product.id,
      categoryId: product.category?.id,
      whoMade: product.whoMade,
      isDigital: product.isDigital,
      variantType: product.variantType,
      attributeOptionKeys: product.attributeValues.getItems()
        .map((attributeValue) => {
          const optionValue = attributeValue.selectedOption?.value;

          return optionValue
            ? `${attributeValue.categoryAttribute.key}:${toFacetKey(optionValue)}`
            : '';
        })
        .filter(Boolean),
      inferredFacetKeys: getInferredFacetTermsFromProduct(product),
      minPriceAmountMinor: await this.getComparablePrice(product),
      inStock: product.inventoryRecords.getItems().some((inventory) => inventory.stock > 0),
      stockTotal: product.inventoryRecords.getItems().reduce((sum, inventory) => sum + inventory.stock, 0),
      popularityScore: product.views,
      createdAt: product.createdAt,
    };
  }

  private async getComparablePrice(product: ProductEntity): Promise<number> {
    const inventory = getPrimaryInventory(product);

    if (!inventory) {
      return Number.POSITIVE_INFINITY;
    }

    const pricing = await this.resolvedStorefrontPriceService.resolveForCurrentRequest(inventory);

    return pricing?.amountMinor ?? Number.POSITIVE_INFINITY;
  }

  private async getResolvedPublicPricing(
    inventory: ProductInventoryEntity
  ): Promise<{ amountMinor?: number; originalAmountMinor?: number; currency?: string }> {
    const pricing = await this.resolvedStorefrontPriceService.resolveForCurrentRequest(inventory);

    return {
      amountMinor: pricing?.amountMinor,
      ...(pricing?.originalAmountMinor !== undefined ? { originalAmountMinor: pricing.originalAmountMinor } : {}),
      currency: pricing?.currency,
    };
  }
}

function toFacetKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getInferredFacetTermsFromProduct(product: ProductEntity): string[] {
  return Array.from(new Set(
    [
      product.title,
      product.description,
      ...product.attributeValues.getItems().map((attributeValue) => attributeValue.selectedOption?.value),
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => toFacetKey(value))
  ));
}
