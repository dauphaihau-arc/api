import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import {
  PayoutAccountRepository,
  type PayoutAccountPaymentTarget,
  type PayoutAccountRecord,
  type ReplacePayoutAccountInput,
  type UpdatePayoutAccountStatusInput,
} from '../../../app/ports/payout-account.repository';
import type { PayoutAccountStatus } from '../../../domain/rules/payout-account';

interface PayoutAccountRow {
  id: string;
  shop_id: string;
  type: PayoutAccountRecord['type'];
  provider: string;
  holder_name: string;
  bank_name: string;
  country: string;
  currency: string;
  last4: string;
  status: PayoutAccountStatus;
  verified_at: Date | null;
}

/**
 * Persists Payout Accounts. Reads select only the display-safe columns: the
 * reference ciphertext never has a reason to enter the process for a read.
 * `replaceActive` serializes replacements per shop with a transaction-scoped
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
        `select id, shop_id, type, provider, holder_name, bank_name, country,
              currency, last4, status, verified_at
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
      type: PayoutAccountPaymentTarget['type'];
      provider: string;
      holder_name: string;
      bank_name: string;
      country: string;
      currency: string;
      last4: string;
      provider_ref_encrypted: string;
    }>>(
        `select id, shop_id, type, provider, holder_name, bank_name, country,
              currency, last4, provider_ref_encrypted
       from payout_accounts
       where shop_id = ? and deactivated_at is null and status = 'active'
       limit 1`,
        [shopId],
      );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      shopId: row.shop_id,
      type: row.type,
      provider: row.provider,
      holderName: row.holder_name,
      bankName: row.bank_name,
      country: row.country,
      currency: row.currency,
      last4: row.last4,
      providerRefEncrypted: row.provider_ref_encrypted,
    };
  }

  async findPaymentTargetById(
    payoutAccountId: string,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountPaymentTarget | null> {
    const rows = await (context?.entityManager ?? this.entityManager.fork())
      .execute<Array<{
      id: string;
      shop_id: string;
      type: PayoutAccountPaymentTarget['type'];
      provider: string;
      holder_name: string;
      bank_name: string;
      country: string;
      currency: string;
      last4: string;
      provider_ref_encrypted: string;
    }>>(
        `select id, shop_id, type, provider, holder_name, bank_name, country,
              currency, last4, provider_ref_encrypted
       from payout_accounts
       where id = ?`,
        [payoutAccountId],
      );

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      shopId: row.shop_id,
      type: row.type,
      provider: row.provider,
      holderName: row.holder_name,
      bankName: row.bank_name,
      country: row.country,
      currency: row.currency,
      last4: row.last4,
      providerRefEncrypted: row.provider_ref_encrypted,
    };
  }

  async updateStatus(
    input: UpdatePayoutAccountStatusInput,
    context?: FinanceRepositoryContext,
  ): Promise<PayoutAccountRecord | null> {
    const rows = await (context?.entityManager ?? this.entityManager.fork())
      .execute<PayoutAccountRow[]>(
        `update payout_accounts
       set status = ?, verified_at = ?, updated_at = ?
       where shop_id = ? and deactivated_at is null
       returning id, shop_id, type, provider, holder_name, bank_name, country,
                 currency, last4, status, verified_at`,
        [input.status, input.verifiedAt, new Date(), input.shopId],
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

  async replaceActive(
    input: ReplacePayoutAccountInput,
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
         id, created_at, updated_at, shop_id, type, provider,
         provider_ref_encrypted, holder_name, bank_name, country, currency,
         last4, status, verified_at, deactivated_at
       )
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, null)
       returning id, shop_id, type, provider, holder_name, bank_name, country,
                 currency, last4, status, verified_at`,
      [
        randomUUID(),
        now,
        now,
        input.shopId,
        input.type,
        input.provider,
        input.providerRefEncrypted,
        input.holderName,
        input.bankName,
        input.country,
        input.currency,
        input.last4,
        'pending',
      ],
    );

    return this.toRecord(rows[0]);
  }

  private toRecord(row: PayoutAccountRow): PayoutAccountRecord {
    return {
      id: row.id,
      shopId: row.shop_id,
      type: row.type,
      provider: row.provider,
      holderName: row.holder_name,
      bankName: row.bank_name,
      country: row.country,
      currency: row.currency,
      last4: row.last4,
      status: row.status,
      verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
    };
  }
}
