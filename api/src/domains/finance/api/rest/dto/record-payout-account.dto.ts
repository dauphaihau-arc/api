import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * Body of the seller Payout Account record/replace endpoint. Field values are
 * only asserted to be strings here: what makes a holder name, bank name,
 * country or reference acceptable is the Finance domain rule, so a malformed
 * value surfaces as `PAYOUT_ACCOUNT_INVALID` rather than as a validation
 * failure. The currency is resolved server-side and is never accepted.
 */
export class RecordPayoutAccountDto {
  @ApiProperty({
    description: 'Name the account is held in.',
    example: 'Jane Seller',
  })
  @Expose({ name: 'holder_name' })
  @Transform(({ value, obj: source }) => value ?? source.holder_name)
  @IsString()
  holderName!: string;

  @ApiProperty({
    description: 'Bank the account is held at.',
    example: 'Example Bank',
  })
  @Expose({ name: 'bank_name' })
  @Transform(({ value, obj: source }) => value ?? source.bank_name)
  @IsString()
  bankName!: string;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 country code of the account.',
    example: 'US',
  })
  @Expose({ name: 'country' })
  @Transform(({ value, obj: source }) => value ?? source.country)
  @IsString()
  country!: string;

  @ApiProperty({
    description:
      'The account number payouts are sent to. Stored encrypted and never ' +
      'returned.',
    example: '0123456789',
  })
  @Expose({ name: 'account_reference' })
  @Transform(({ value, obj: source }) => value ?? source.account_reference)
  @IsString()
  accountReference!: string;
}
