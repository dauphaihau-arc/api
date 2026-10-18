import { Injectable } from '@nestjs/common';
import { AuditLogService } from '~/integrations/audit/app/audit-log.service';
import {
  assertValidCommissionRate,
  type CommissionSchedule,
} from '../../../domain/rules/commission-schedule';
import { CommissionScheduleRepository } from '../../ports/commission-schedule.repository';

export interface RecordCommissionScheduleInput {
  shopId: string;
  shopPublicId: string;
  effectiveFrom: Date;
  rateBasisPoints: number;
}

/**
 * Records a shop's Platform Commission rate as of an effective-from instant, and
 * audits the mutation against the operator who made it (the audit service reads
 * the actor from the request context).
 */
@Injectable()
export class RecordCommissionScheduleUseCase {
  constructor(
    private readonly commissionScheduleRepository: CommissionScheduleRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async execute(input: RecordCommissionScheduleInput): Promise<CommissionSchedule> {
    assertValidCommissionRate(input.rateBasisPoints);

    const schedule = await this.commissionScheduleRepository.upsert(
      input.shopId,
      input.effectiveFrom,
      input.rateBasisPoints,
    );

    await this.auditLogService.record({
      action: 'finance.commission_schedule.recorded',
      entityType: 'commission_schedule',
      entityId: input.shopId,
      entityPublicId: input.shopPublicId,
      summary: {
        shopId: input.shopId,
        effectiveFrom: schedule.effectiveFrom.toISOString(),
        rateBasisPoints: schedule.rateBasisPoints,
      },
    });

    return schedule;
  }
}
