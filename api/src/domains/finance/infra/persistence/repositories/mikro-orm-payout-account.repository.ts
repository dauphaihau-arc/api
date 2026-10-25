import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import {
  PayoutAccountRepository,
  type CreatePayoutAccountInput,
  type PayoutAccountPaymentTarget,
  type PayoutAccountRecord,
  type UpdatePayoutAccountInput,
} from '../../../app/ports/payout-account.repository';
import type {
  PayoutAccountRequirements,
  PayoutAccountStatus,
} from '../../../domain/rules/payout-account';

interface PayoutAccountRow {
  id: string;
  shop_id: string;
  provider: string;
  provider_account_id: string | null;
  country: string;
  currency: string;
  status: PayoutAccountStatus;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  transfers_capability: string | null;
  requirements: PayoutAccountRequirements | null;
  default_currency: string | null;
  bank_name: string | null;
  last4: string | null;
  /** `timestamptz`; raw execution may hand it back as a string or a Date. */
  updated_at: Date | string;
}

const RECORD_COLUMNS = `id, shop_id, provider, provider_account_id, country,
  currency, status, payouts_enabled, charges_enabled, transfers_capability,
  requirements, default_currency, bank_name, last4, updated_at`;

/**
 * Persists Payout Accounts. The row is a pointer to a provider's connected
 * account plus the capabilities it reports, so no read has to decrypt, mask or
 * otherwise touch bank data.
 *
 * `createActive` serializes replacements per shop with a transaction-scoped
 * advisory lock before closing the open row and inserting its successor, so two
 * concurrent writes cannot both leave an active row.
 */
@Injectable()
export class MikroOrmPayoutAccountRepository implements PayoutAccountRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async findActiveByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord | null> {
    const rows = await (context?.entityManager ?? this.entityManager.fork())
      .execute<PayoutAccountRow[]>(
        `select ${RECORD_COLUMNS}
       from payout_accounts
       where shop_id = ? and deactivated_at is null
       limit 1`,
        [shopId],
      );

    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async findPayableByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountPaymentTarget | null> {
    const rows = await (context?.entityManager ?? this.entityManager.fork())
      .execute<Array<{
      id: string;
      shop_id: string;
      provider: string;
      provider_account_id: string | null;
      country: string;
      currency: string;
    }>>(
        `select id, shop_id, provider, provider_account_id, country, currency
       from payout_accounts
       where shop_id = ? and deactivated_at is null and status = 'active'
         and (
           provider <> 'stripe_connect'
           or (payouts_enabled and transfers_capability = 'active')
         )
       limit 1`,
        [shopId],
      );

    return rows[0] ? this.toPaymentTarget(rows[0]) : null;
  }

  async findPaymentTargetById(
    payoutAccountId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountPaymentTarget | null> {
    const rows = await (context?.entityManager ?? this.entityManager.fork())
      .execute<Array<{
      id: string;
      shop_id: string;
      provider: string;
      provider_account_id: string | null;
      country: string;
      currency: string;
    }>>(
        `select id, shop_id, provider, provider_account_id, country, currency
       from payout_accounts
       where id = ?`,
        [payoutAccountId],
      );

    return rows[0] ? this.toPaymentTarget(rows[0]) : null;
  }

  async findByProviderAccountId(
    providerAccountId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord | null> {
    const rows = await (context?.entityManager ?? this.entityManager.fork())
      .execute<PayoutAccountRow[]>(
        `select ${RECORD_COLUMNS}
       from payout_accounts
       where provider_account_id = ?
       limit 1`,
        [providerAccountId],
      );

    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async closeActive(
    shopId: string,
    at: Date,
    context?: FinanceRepositoryContext,
  ): Promise<void> {
    await (context?.entityManager ?? this.entityManager.fork()).execute(
      `update payout_accounts
       set deactivated_at = ?, updated_at = ?
       where shop_id = ? and deactivated_at is null`,
      [at, at, shopId],
    );
  }

  async createActive(
    input: CreatePayoutAccountInput,
    context: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord> {
    const entityManager = context.entityManager ?? this.entityManager.fork();
    const now = new Date();

    // The caller owns the transaction, so this lock spans the close and the
    // insert instead of only this statement.
    await entityManager.execute(
      'select pg_advisory_xact_lock(hashtext(?))',
      [input.shopId],
    );

    await entityManager.execute(
      `update payout_accounts
       set deactivated_at = ?, updated_at = ?
       where shop_id = ? and deactivated_at is null`,
      [now, now, input.shopId],
    );

    const rows = await entityManager.execute<PayoutAccountRow[]>(
      `insert into payout_accounts (
         id, created_at, updated_at, shop_id, provider, provider_account_id,
         country, currency, status, payouts_enabled, charges_enabled,
         transfers_capability, requirements, default_currency, deactivated_at
       )
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null)
       returning ${RECORD_COLUMNS}`,
      [
        randomUUID(),
        now,
        now,
        input.shopId,
        input.provider,
        input.providerAccountId,
        input.country,
        input.currency,
        input.status,
        input.payoutsEnabled ?? false,
        input.chargesEnabled ?? false,
        input.transfersCapability ?? null,
        input.requirements ?? null,
        input.defaultCurrency ?? null,
      ],
    );

    return this.toRecord(rows[0]!);
  }

  async updateActive(
    input: UpdatePayoutAccountInput,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord | null> {
    const assignments: string[] = [];
    const values: unknown[] = [];

    const assign = (column: string, value: unknown) => {
      assignments.push(`${column} = ?`);
      values.push(value);
    };

    if (input.provider !== undefined) assign('provider', input.provider);
    if (input.providerAccountId !== undefined) {
      assign('provider_account_id', input.providerAccountId);
    }
    if (input.country !== undefined) assign('country', input.country);
    if (input.currency !== undefined) assign('currency', input.currency);
    if (input.status !== undefined) assign('status', input.status);
    if (input.payoutsEnabled !== undefined) {
      assign('payouts_enabled', input.payoutsEnabled);
    }
    if (input.chargesEnabled !== undefined) {
      assign('charges_enabled', input.chargesEnabled);
    }
    if (input.transfersCapability !== undefined) {
      assign('transfers_capability', input.transfersCapability);
    }
    if (input.requirements !== undefined) {
      assign('requirements', input.requirements);
    }
    if (input.defaultCurrency !== undefined) {
      assign('default_currency', input.defaultCurrency);
    }
    if (input.bankName !== undefined) assign('bank_name', input.bankName);
    if (input.last4 !== undefined) assign('last4', input.last4);

    if (assignments.length === 0) {
      return this.findActiveByShopId(input.shopId, context);
    }

    assign('updated_at', new Date());

    const rows = await (context?.entityManager ?? this.entityManager.fork())
      .execute<PayoutAccountRow[]>(
        `update payout_accounts
       set ${assignments.join(', ')}
       where shop_id = ? and deactivated_at is null
       returning ${RECORD_COLUMNS}`,
        [...values, input.shopId],
      );

    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async touchActive(shopId: string, at: Date): Promise<void> {
    await this.entityManager.fork().execute(
      `update payout_accounts
       set updated_at = ?
       where shop_id = ? and deactivated_at is null`,
      [at, shopId],
    );
  }

  private toRecord(row: PayoutAccountRow): PayoutAccountRecord {
    return {
      id: row.id,
      shopId: row.shop_id,
      provider: row.provider,
      providerAccountId: row.provider_account_id,
      country: row.country,
      currency: row.currency,
      status: row.status,
      payoutsEnabled: row.payouts_enabled,
      chargesEnabled: row.charges_enabled,
      transfersCapability: row.transfers_capability,
      requirements: row.requirements,
      defaultCurrency: row.default_currency,
      bankName: row.bank_name,
      last4: row.last4,
      updatedAt: new Date(row.updated_at),
    };
  }

  private toPaymentTarget(row: {
    id: string;
    shop_id: string;
    provider: string;
    provider_account_id: string | null;
    country: string;
    currency: string;
  }): PayoutAccountPaymentTarget {
    return {
      id: row.id,
      shopId: row.shop_id,
      provider: row.provider,
      providerAccountId: row.provider_account_id,
      country: row.country,
      currency: row.currency,
    };
  }
}
