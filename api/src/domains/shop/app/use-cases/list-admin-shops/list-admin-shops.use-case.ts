import { Injectable } from '@nestjs/common';
import { ShopRepository } from '../../ports/shop.repository';
import type { AdminShopListResult, ListAdminShopsQuery } from '../../shop.types';

/**
 * The operator's read of the shop directory. Seller-facing reads stay on
 * `ShopSummary`; this path adds the owner's email for support and triage.
 */
@Injectable()
export class ListAdminShopsUseCase {
  constructor(private readonly shopRepository: ShopRepository) {}

  async execute(query: ListAdminShopsQuery): Promise<AdminShopListResult> {
    const page = query.page;
    const limit = query.limit;
    const search = query.search?.trim() || undefined;

    const { items, totalResults } = await this.shopRepository.findAllForAdmin({
      page,
      limit,
      search,
    });

    return {
      results: items,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(totalResults / limit)),
      totalResults,
    };
  }
}
