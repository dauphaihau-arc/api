import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import {
  SellerPayableQueryRepository,
  type SellerPayableBalance,
} from '../../../app/ports/seller-payable-query.repository';

/** Reads a shop's Seller Payable balance, projected from its Postings. */
@Injectable()
export class MikroOrmSellerPayableQueryRepository
implements SellerPayableQueryRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findBalanceByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<SellerPayableBalance | null> {
    const rows = await this.getEntityManager(context).execute<
      Array<SellerPayableBalance>
    >(
      `select s."id" as "shopId",
              coalesce(p."currency", h."currency", s."currency") as "currency",
              coalesce(p."available_balance_minor", 0) as "availableMinor",
              coalesce(p."pending_balance_minor", 0) as "notYetAvailableMinor"
       from "shops" s
       left join "seller_payable_balances" p on p."shop_id" = s."id"
       left join lateral (
         select "currency"
         from "settlement_currency_history"
         where "shop_id" = s."id" and "effective_to" is null
         order by "effective_from" desc
         limit 1
       ) h on true
       where s."id" = ?
       limit 1`,
      [shopId],
    );

    return rows[0] ?? null;
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
