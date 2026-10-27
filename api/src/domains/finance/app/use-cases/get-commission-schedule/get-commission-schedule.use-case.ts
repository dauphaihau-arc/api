import { Injectable } from '@nestjs/common';
import { Clock } from '~/platform/time/clock';
import {
  type CommissionSchedule,
  resolveEffectiveSchedule,
} from '../../../domain/rules/commission-schedule';
import { CommissionScheduleRepository } from '../../ports/commission-schedule.repository';

export interface GetCommissionScheduleInput {
  shopId: string;
}

/**
 * The Commission Schedule in force for a shop right now: the latest schedule
 * whose effective-from is at or before the current instant. A shop with no
 * schedule yet reads as null rather than as a missing shop.
 */
@Injectable()
export class GetCommissionScheduleUseCase {
  constructor(
    private readonly commissionScheduleRepository: CommissionScheduleRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: GetCommissionScheduleInput,
  ): Promise<CommissionSchedule | null> {
    const schedules = await this.commissionScheduleRepository
      .listByShopId(input.shopId);

    return resolveEffectiveSchedule(schedules, this.clock.now());
  }
}
