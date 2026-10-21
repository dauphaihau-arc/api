import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import {
  PayoutSettingsRepository,
  type PayoutSettingsRecord,
} from '../../../app/ports/payout-settings.repository';

/** One `payout_settings` row, as Postgres returns it. */
interface PayoutSettingsRow {
  shop_id: string;
  auto_payout_enabled: boolean;
  auto_payout_enabled_at: Date | null;
}

/**
 * Persists a shop's payout preferences as a single row per shop. Raw SQL through
 * `entityManager.execute` so a write joins the caller's transaction, and an
 * upsert so opting in and out is one statement.
 */
@Injectable()
export class MikroOrmPayoutSettingsRepository implements PayoutSettingsRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async find(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutSettingsRecord> {
    const rows = await this.getEntityManager(context).execute<PayoutSettingsRow[]>(
      `select shop_id, auto_payout_enabled, auto_payout_enabled_at
       from payout_settings
       where shop_id = ?`,
      [shopId],
    );
    const row = rows[0];

    return {
      shopId,
      autoPayoutEnabled: row?.auto_payout_enabled ?? false,
      autoPayoutEnabledAt: row?.auto_payout_enabled_at
        ? new Date(row.auto_payout_enabled_at)
        : null,
    };
  }

  async setAutoPayoutEnabled(
    shopId: string,
    enabled: boolean,
    enabledAt: Date,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutSettingsRecord> {
    const rows = await this.getEntityManager(context).execute<PayoutSettingsRow[]>(
      `insert into payout_settings (
         shop_id, auto_payout_enabled, auto_payout_enabled_at, created_at, updated_at
       )
       values (?, ?, case when ? then cast(? as timestamptz) else null end, ?, ?)
       on conflict (shop_id) do update
         set auto_payout_enabled_at = case
               when excluded.auto_payout_enabled = false then null
               when payout_settings.auto_payout_enabled = false then excluded.auto_payout_enabled_at
               else payout_settings.auto_payout_enabled_at
             end,
             auto_payout_enabled = excluded.auto_payout_enabled,
             updated_at = excluded.updated_at
       returning shop_id, auto_payout_enabled, auto_payout_enabled_at`,
      [shopId, enabled, enabled, enabledAt, enabledAt, enabledAt],
    );
    const row = rows[0]!;

    return {
      shopId: row.shop_id,
      autoPayoutEnabled: row.auto_payout_enabled,
      autoPayoutEnabledAt: row.auto_payout_enabled_at
        ? new Date(row.auto_payout_enabled_at)
        : null,
    };
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
