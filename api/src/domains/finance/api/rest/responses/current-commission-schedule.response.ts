import { ApiProperty } from '@nestjs/swagger';
import type { CommissionSchedule } from '../../../domain/rules/commission-schedule';

export class CurrentCommissionScheduleResponseDto {
  @ApiProperty({
    description: 'Instant from which the rate takes effect (ISO-8601).',
    example: '2026-10-01T00:00:00.000Z',
  })
  effective_from!: string;

  @ApiProperty({
    description: 'Commission rate in basis points (1500 is 15.00%).',
    example: 1500,
  })
  rate_basis_points!: number;
}

export class AdminShopCommissionScheduleResponseDto {
  @ApiProperty({
    description: 'Public id of the shop the schedule belongs to.',
    example: 'shp_01HZY4T2M8R6N3Q7W9K1V0B5CD',
  })
  shop_id!: string;

  @ApiProperty({
    description:
      'The schedule in force now, or null when the shop has no schedule that ' +
      'has taken effect yet.',
    type: () => CurrentCommissionScheduleResponseDto,
    nullable: true,
  })
  schedule!: CurrentCommissionScheduleResponseDto | null;
}

/** Serializes the Commission Schedule in force for the admin HTTP surface. */
export function toAdminShopCommissionScheduleResponse(
  schedule: CommissionSchedule | null,
  shopPublicId: string,
): AdminShopCommissionScheduleResponseDto {
  return {
    shop_id: shopPublicId,
    schedule: schedule === null
      ? null
      : {
        effective_from: schedule.effectiveFrom.toISOString(),
        rate_basis_points: schedule.rateBasisPoints,
      },
  };
}
