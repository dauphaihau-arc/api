import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';
import { ShopAccessService } from '~/domains/shop/app/services/shop-access.service';
import { SellerProductQueryRepository } from '../ports/seller-product-query.repository';
import type { ProductDraftSummary } from '../product.types';

/**
 * Resolves the product a seller-facing route acts on for the shop named in the
 * route, in one place: the actor must manage the shop, and the product must
 * belong to it. Controllers pass raw public ids and receive the loaded summary.
 */
@Injectable()
export class ShopProductAccessService {
  constructor(
    private readonly shopAccessService: ShopAccessService,
    private readonly sellerProductQueryRepository: SellerProductQueryRepository,
  ) {}

  async resolveManageableProduct(
    actor: AuthenticatedUser,
    shopPublicId: string,
    productPublicId: string,
  ): Promise<ProductDraftSummary> {
    const shop = await this.shopAccessService.resolveManageableShopByPublicId(
      actor,
      shopPublicId,
    );

    const product = await this.sellerProductQueryRepository.findByPublicId(
      productPublicId,
    );

    if (!product || product.shopId !== shop.id) {
      throw new NotFoundException('Product was not found');
    }

    return product;
  }
}
