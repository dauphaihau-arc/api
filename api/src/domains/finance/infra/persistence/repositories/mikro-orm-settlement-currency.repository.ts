import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import {
  SettlementCurrencyRepository,
  type RecordSettlementCurrencyChangeInput,
  type SettlementCurrencyCutoverStep,
  type SettlementCurrencyPeriod,
} from '../../../app/ports/settlement-currency.repository';

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

  async findCutoverRates(
    shopId: string,
    fromCurrency: string,
    at: Date,
    context?: FinanceRepositoryContext,
  ): Promise<SettlementCurrencyCutoverStep[] | null> {
    const rows = await (context?.entityManager ?? this.entityManager.fork()).execute<
      Array<{
        currency: string;
        previousCurrency: string | null;
        cutoverRate: string | null;
        effectiveFrom: Date;
        effectiveTo: Date | null;
      }>
    >(
      `select "currency", "previous_currency" as "previousCurrency",
              "cutover_rate" as "cutoverRate",
              "effective_from" as "effectiveFrom", "effective_to" as "effectiveTo"
       from "settlement_currency_history"
       where "shop_id" = ?
       order by "effective_from" asc`,
      [shopId],
    );

    if (rows.length === 0) {
      return null;
    }

    const recordedAt = at.getTime();
    // The row that was open when the original entry was recorded. A shop's
    // history may return to a currency it used before, so take the latest such
    // row rather than the first.
    const originIndex = rows.reduce((found, row, index) => {
      const from = new Date(row.effectiveFrom).getTime();
      const to = row.effectiveTo ? new Date(row.effectiveTo).getTime() : Number.POSITIVE_INFINITY;

      return row.currency === fromCurrency && from <= recordedAt && recordedAt < to
        ? index
        : found;
    }, -1);

    if (originIndex === -1) {
      return null;
    }

    const steps: SettlementCurrencyCutoverStep[] = [];
    let currentCurrency = fromCurrency;

    for (const row of rows.slice(originIndex + 1)) {
      if (row.currency === currentCurrency) {
        continue;
      }

      if (!row.cutoverRate) {
        return null;
      }

      steps.push({
        fromCurrency: currentCurrency,
        toCurrency: row.currency,
        rate: row.cutoverRate,
      });
      currentCurrency = row.currency;
    }

    return steps;
  }

  async findOpenPeriod(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<SettlementCurrencyPeriod | null> {
    const rows = await (context?.entityManager ?? this.entityManager.fork()).execute<
      Array<{
        currency: string;
        effectiveFrom: Date;
        previousCurrency: string | null;
        cutoverRate: string | null;
      }>
    >(
      `select "currency", "effective_from" as "effectiveFrom",
              "previous_currency" as "previousCurrency",
              "cutover_rate" as "cutoverRate"
       from "settlement_currency_history"
       where "shop_id" = ? and "effective_to" is null
       order by "effective_from" desc
       limit 1`,
      [shopId],
    );
    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      currency: row.currency,
      effectiveFrom: new Date(row.effectiveFrom),
      previousCurrency: row.previousCurrency,
      cutoverRate: row.cutoverRate,
    };
  }

  async lockShopForChange(
    shopId: string,
    context: FinanceRepositoryContext,
  ): Promise<void> {
    await (context.entityManager ?? this.entityManager.fork()).execute(
      'select "id" from "shops" where "id" = ? for update',
      [shopId],
    );
  }

  async recordChange(
    input: RecordSettlementCurrencyChangeInput,
    context: FinanceRepositoryContext,
  ): Promise<SettlementCurrencyPeriod> {
    const entityManager = context.entityManager ?? this.entityManager.fork();
    const now = new Date();

    await entityManager.execute(
      `update "settlement_currency_history"
       set "effective_to" = ?, "updated_at" = ?
       where "shop_id" = ? and "effective_to" is null`,
      [input.effectiveFrom, now, input.shopId],
    );

    const rows = await entityManager.execute<
      Array<{
        currency: string;
        effectiveFrom: Date;
        previousCurrency: string;
        cutoverRate: string;
      }>
    >(
      `insert into "settlement_currency_history" (
         "id", "created_at", "updated_at", "shop_id", "currency",
         "effective_from", "effective_to", "previous_currency", "cutover_rate"
       )
       values (gen_random_uuid(), ?, ?, ?, ?, ?, null, ?, ?)
       returning "currency", "effective_from" as "effectiveFrom",
                 "previous_currency" as "previousCurrency",
                 "cutover_rate" as "cutoverRate"`,
      [
        now,
        now,
        input.shopId,
        input.currency,
        input.effectiveFrom,
        input.previousCurrency,
        input.cutoverRate,
      ],
    );
    const row = rows[0]!;

    await entityManager.execute(
      'update "shops" set "currency" = ?, "updated_at" = ? where "id" = ?',
      [input.currency, now, input.shopId],
    );

    return {
      currency: row.currency,
      effectiveFrom: new Date(row.effectiveFrom),
      previousCurrency: row.previousCurrency,
      cutoverRate: row.cutoverRate,
    };
  }
}
