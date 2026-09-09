import { Injectable } from '@nestjs/common';
import { err, ok, Result } from '~/platform/application/result';
import { toSlug } from '~/platform/utils/slugify';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { CategoryRepository } from '~/domains/category/app/ports/category.repository';
import { ShopRepository } from '~/domains/shop/app/ports/shop.repository';
import { ProductWhoMade } from '../../../domain/enums/product-who-made.enum';
import {
  ActorCannotCreateProductDraftError,
  CategoryNotFoundError,
} from '../../errors/product-app.error';
import { ProductCommandRepository } from '../../ports/product-command.repository';
import { SellerProductQueryRepository } from '../../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../../product.types';

export interface CreateProductDraftInput {
  shopId: string;
  categoryId?: string;
  title: string;
  description: string;
  whoMade: ProductWhoMade;
  isDigital?: boolean;
  nonTaxable?: boolean;
  tags?: string[];
}

type CreateProductDraftError =
  | ActorCannotCreateProductDraftError
  | CategoryNotFoundError;

@Injectable()
export class CreateProductDraftUseCase {
  constructor(
    private readonly shopRepository: ShopRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
    private readonly productCommandRepository: ProductCommandRepository,
  ) {}

  async execute(
    actor: AuthenticatedUser,
    input: CreateProductDraftInput,
  ): Promise<Result<ProductDraftSummary, CreateProductDraftError>> {
    const canManageAnyShop = actor.roles.includes('admin');

    const shop = canManageAnyShop
      ? await this.shopRepository.findById(input.shopId)
      : await this.shopRepository.findOwnedById(input.shopId, actor.userId);

    if (!shop) {
      return err(new ActorCannotCreateProductDraftError());
    }

    if (input.categoryId) {
      const category = await this.categoryRepository.findById(input.categoryId);

      if (!category) {
        return err(new CategoryNotFoundError(input.categoryId));
      }
    }


    const slug = await this.createAvailableSlug(
      input.shopId,
      toSlug(input.title) || 'product',
    );

    const product = await this.productCommandRepository.createDraft({
      shopId: input.shopId,
      categoryId: input.categoryId,
      title: input.title.trim(),
      slug,
      description: input.description.trim(),
      whoMade: input.whoMade,
      isDigital: input.isDigital ?? false,
      nonTaxable: input.nonTaxable ?? false,
      tags: sanitizeTags(input.tags) ?? [],
    });

    return ok(product);
  }

  private async createAvailableSlug(
    shopId: string,
    baseSlug: string,
  ): Promise<string> {
    const existingSlugs = await this.sellerProductQueryRepository
      .listSlugsByShopIdAndPrefix(shopId, baseSlug);

    return chooseAvailableProductSlug(baseSlug, existingSlugs);
  }

}

function chooseAvailableProductSlug(
  baseSlug: string,
  existingSlugs: string[],
): string {
  const relevantSlugs = new Set(existingSlugs.filter((slug) =>
    slug === baseSlug || isNumericSlugSuffix(baseSlug, slug),
  ));

  if (!relevantSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;

  while (relevantSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

function isNumericSlugSuffix(baseSlug: string, slug: string): boolean {
  const suffix = slug.slice(baseSlug.length + 1);

  return slug.startsWith(`${baseSlug}-`) && /^[2-9]\d*$/.test(suffix);
}

function sanitizeTags(tags?: string[]): string[] | undefined {
  return tags?.map((tag) => tag.trim()).filter(Boolean);
}
