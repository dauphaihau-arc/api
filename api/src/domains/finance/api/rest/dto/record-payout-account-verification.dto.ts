import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * Body of the admin Payout Account verification endpoint. Only asserted to be a
 * string here: which statuses are acceptable is the Finance domain rule, so an
 * unknown status surfaces as `PAYOUT_ACCOUNT_INVALID`.
 */
export class RecordPayoutAccountVerificationDto {
  @ApiProperty({
    description: 'The status to move the Payout Account to: active or disabled.',
    example: 'active',
  })
  @Expose({ name: 'status' })
  @Transform(({ value, obj: source }) => value ?? source.status)
  @IsString()
  status!: string;
}
