import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsIn } from 'class-validator';
import {
  MARKETPLACE_CURRENCIES,
  type MarketplaceCurrency,
} from '~/platform/config/marketplace.config';

/**
 * Body of the seller Settlement Currency change. The currency is trimmed and
 * upper-cased before validation so `eur` names the same currency as `EUR`; the
 * accepted set is the marketplace's own currency list.
 */
export class ChangeSettlementCurrencyDto {
  @ApiProperty({
    description: 'The Settlement Currency the shop moves to.',
    enum: MARKETPLACE_CURRENCIES,
    example: 'EUR',
  })
  @Expose({ name: 'currency' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(MARKETPLACE_CURRENCIES)
  currency!: MarketplaceCurrency;
}
