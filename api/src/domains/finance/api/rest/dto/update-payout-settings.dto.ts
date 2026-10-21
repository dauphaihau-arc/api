import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Body of the seller payout settings endpoint. The seller decides only whether
 * automatic payouts may pay the shop; the day of month and the manual allowance
 * are platform-wide and stay read-only.
 */
export class UpdatePayoutSettingsDto {
  @ApiProperty({
    description:
      'Whether automatic Payout Runs may pay this shop without a manual request.',
    example: true,
  })
  @Expose({ name: 'auto_payout_enabled' })
  @Transform(({ value, obj: source }) => value ?? source.auto_payout_enabled)
  @IsBoolean()
  autoPayoutEnabled!: boolean;
}
