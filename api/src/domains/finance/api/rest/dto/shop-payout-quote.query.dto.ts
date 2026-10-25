import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/**
 * Query of the seller Payout quote. The amount is required: a quote states what
 * a specific shop-currency amount would become, and the claim decides what is
 * actually payable.
 */
export class ShopPayoutQuoteQueryDto {
  @ApiProperty({
    description:
      'Amount to quote in the shop Settlement Currency minor units.',
    example: 12_500,
    minimum: 1,
  })
  @Expose({ name: 'amount_minor' })
  @Transform(({ value, obj: source }) =>
    Number(value ?? source.amount_minor))
  @IsInt()
  @Min(1)
  amountMinor!: number;
}
