import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import { SellerPayableCommandRepository } from '../../../app/ports/seller-payable-command.repository';

@Injectable()
export class MikroOrmSellerPayableCommandRepository implements SellerPayableCommandRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async creditNotYetAvailable(
    shopId: string,
    currency: string,
    amountMinor: number,
    context: FinanceRepositoryContext,
  ): Promise<void> {
    const now = new Date();

    await this.getEntityManager(context).execute(
      `insert into seller_payable_positions (
         id, shop_id, currency, available_minor, not_yet_available_minor,
         created_at, updated_at
       )
       values (?, ?, ?, 0, ?, ?, ?)
       on conflict (shop_id, currency) do update
       set
         not_yet_available_minor =
           seller_payable_positions.not_yet_available_minor
           + excluded.not_yet_available_minor,
         updated_at = now()`,
      [randomUUID(), shopId, currency, amountMinor, now, now],
    );
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
