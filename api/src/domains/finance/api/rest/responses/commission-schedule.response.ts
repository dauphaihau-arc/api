import { ApiProperty } from '@nestjs/swagger';
import type { CommissionSchedule } from '../../../domain/rules/commission-schedule';

export class CommissionScheduleResponseDto {
  @ApiProperty({
    description: 'Public id of the shop the schedule belongs to.',
    example: 'shp_01HZY4T2M8R6N3Q7W9K1V0B5CD',
  })
  shop_id!: string;

  @ApiProperty({
    description: 'Instant from which the rate takes effect (ISO-8601).',
    example: '2026-11-01T00:00:00.000Z',
  })
  effective_from!: string;

  @ApiProperty({
    description: 'Commission rate in basis points (1500 is 15.00%).',
    example: 1500,
  })
  rate_basis_points!: number;
}

/** Serializes a recorded Commission Schedule for the admin HTTP surface. */
export function toCommissionScheduleResponse(
  schedule: CommissionSchedule,
  shopPublicId: string,
): CommissionScheduleResponseDto {
  return {
    shop_id: shopPublicId,
    effective_from: schedule.effectiveFrom.toISOString(),
    rate_basis_points: schedule.rateBasisPoints,
  };
}
