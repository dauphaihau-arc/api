import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Body of the seller manual withdrawal endpoint. The amount is optional: leaving
 * it out withdraws the whole net available balance, which is what a seller
 * usually wants. A supplied amount must be a positive number of minor units and
 * is checked against what is actually available before anything is claimed.
 */
export class RequestManualPayoutDto {
  @ApiPropertyOptional({
    description:
      'Amount to withdraw in the shop Settlement Currency minor units. ' +
      'Omitted withdraws all of the net available balance.',
    example: 12_500,
    minimum: 1,
  })
  @Expose({ name: 'amount_minor' })
  @Transform(({ value, obj: source }) => value ?? source.amount_minor)
  @IsOptional()
  @IsInt()
  @Min(1)
  amountMinor?: number;
}
