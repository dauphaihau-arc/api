import {
  Expose,
  Transform,
} from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MARKETPLACE_CURRENCIES, type MarketplaceCurrency } from '~/config/marketplace.config';
import { IsAuthPassword } from '../validation/password-validation';

export class SellerRegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsAuthPassword()
  password!: string;

  @ApiProperty({ name: 'display_name' })
  @Expose({ name: 'display_name' })
  @Transform(({ value, obj: source }) => value ?? source.display_name)
  @IsString()
  @MinLength(1)
  displayName!: string;

  @ApiProperty({ name: 'shop_name' })
  @Expose({ name: 'shop_name' })
  @Transform(({ value, obj: source }) => value ?? source.shop_name)
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  shopName!: string;

  @IsEnum(MARKETPLACE_CURRENCIES)
  currency!: MarketplaceCurrency;
}
