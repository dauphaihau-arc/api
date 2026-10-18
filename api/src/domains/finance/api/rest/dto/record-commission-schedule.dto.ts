import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt } from 'class-validator';

/** Body of the admin Commission Schedule record/replace endpoint. */
export class RecordCommissionScheduleDto {
  @ApiProperty({
    name: 'effective_from',
    description:
      'Instant from which the rate takes effect, as an ISO-8601 date string.',
    example: '2026-11-01T00:00:00.000Z',
  })
  @Expose({ name: 'effective_from' })
  @Transform(({ value, obj: source }) => value ?? source.effective_from)
  @IsDateString()
  effectiveFrom!: string;

  @ApiProperty({
    name: 'rate_basis_points',
    description:
      'Commission rate in basis points (1500 is 15.00%). The 0..10000 range is ' +
      'owned by the domain rule, so an out-of-range rate surfaces as INVALID_COMMISSION_RATE.',
    example: 1500,
  })
  @Expose({ name: 'rate_basis_points' })
  @Transform(({ value, obj: source }) => value ?? source.rate_basis_points)
  @IsInt()
  rateBasisPoints!: number;
}
