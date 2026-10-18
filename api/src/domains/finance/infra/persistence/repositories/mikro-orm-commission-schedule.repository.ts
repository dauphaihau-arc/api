import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CommissionSchedule } from '../../../domain/rules/commission-schedule';
import type { FinanceRepositoryContext } from '../../../app/ports/finance-repository-context';
import { CommissionScheduleRepository } from '../../../app/ports/commission-schedule.repository';

interface CommissionScheduleRow {
  effective_from: Date;
  rate_basis_points: number;
}

@Injectable()
export class MikroOrmCommissionScheduleRepository implements CommissionScheduleRepository {
  constructor(private readonly entityManager: EntityManager) {}

  async listByShopId(
    shopId: string,
    context?: FinanceRepositoryContext,
  ): Promise<CommissionSchedule[]> {
    const rows = await this.getEntityManager(context).execute<CommissionScheduleRow[]>(
      `select effective_from, rate_basis_points
       from commission_schedules
       where shop_id = ?
       order by effective_from desc`,
      [shopId],
    );

    return rows.map((row) => ({
      shopId,
      effectiveFrom: new Date(row.effective_from),
      rateBasisPoints: row.rate_basis_points,
    }));
  }

  async upsert(
    shopId: string,
    effectiveFrom: Date,
    rateBasisPoints: number,
    context?: FinanceRepositoryContext,
  ): Promise<CommissionSchedule> {
    const now = new Date();

    const rows = await this.getEntityManager(context).execute<CommissionScheduleRow[]>(
      `insert into commission_schedules (
         id, shop_id, effective_from, rate_basis_points, created_at, updated_at
       )
       values (?, ?, ?, ?, ?, ?)
       on conflict (shop_id, effective_from) do update
       set
         rate_basis_points = excluded.rate_basis_points,
         updated_at = now()
       returning effective_from, rate_basis_points`,
      [randomUUID(), shopId, effectiveFrom, rateBasisPoints, now, now],
    );

    return {
      shopId,
      effectiveFrom: new Date(rows[0].effective_from),
      rateBasisPoints: rows[0].rate_basis_points,
    };
  }

  private getEntityManager(context?: FinanceRepositoryContext): EntityManager {
    return context?.entityManager ?? this.entityManager.fork();
  }
}
