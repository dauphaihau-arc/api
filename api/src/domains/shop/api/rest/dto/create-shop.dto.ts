import {
  IsEnum, IsString, MaxLength, MinLength, 
} from 'class-validator';
import { MARKETPLACE_CURRENCIES, type MarketplaceCurrency } from '~/platform/config/marketplace.config';

export class CreateShopDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  shop_name!: string;

  @IsEnum(MARKETPLACE_CURRENCIES)
  currency!: MarketplaceCurrency;
}
