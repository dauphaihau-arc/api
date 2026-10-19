import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import { SettlementCurrencyRepository } from '../../../app/ports/settlement-currency.repository';

/**
 * Reads the shop's current Settlement Currency from its dated history, seeding
 * the opening row from the shop's own currency and creation instant on first
 * use — the same write-on-demand shape the ledger accounts already use. Seeding
 * conflicts on `(shop_id, effective_from)`, so concurrent first postings insert
 * one row rather than two.
 */
@Injectable()
export class MikroOrmSettlementCurrencyRepository
implements SettlementCurrencyRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async ensureCurrentCurrency(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<string | null> {
    const entityManager = context?.entityManager ?? this.entityManager.fork();
    const now = new Date();

    await entityManager.execute(
      `insert into settlement_currency_history (
         id, created_at, updated_at, shop_id, currency, effective_from, effective_to
       )
       select gen_random_uuid(), ?, ?, s.id, s.currency, s.created_at, null
       from shops s
       where s.id = ?
       on conflict (shop_id, effective_from) do nothing`,
      [now, now, shopId],
    );

    const rows = await entityManager.execute<Array<{ currency: string }>>(
      `select currency
       from settlement_currency_history
       where shop_id = ? and effective_to is null
       order by effective_from desc
       limit 1`,
      [shopId],
    );

    return rows[0]?.currency ?? null;
  }
}
