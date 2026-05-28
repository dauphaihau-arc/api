import { Expose, Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class ShopAdjustmentDto {
  @Transform(({ value, obj: source }) => value ?? source.shop_id)
  @IsUUID()
  shopId!: string;

  @IsOptional()
  @Transform(({ value, obj: source }) => value ?? source.promo_codes)
  @IsArray()
  @IsString({ each: true })
  promoCodes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  note?: string;
}

export class CreateCheckoutQuoteFromCartDto {
  @IsOptional()
  @Expose({ name: 'presentment_currency' })
  @Transform(({ value, obj: source }) =>
    value
    ?? source.presentmentCurrency
    ?? source.presentment_currency)
  @IsString()
  presentmentCurrency?: string;

  @Expose({ name: 'user_address_id' })
  @Transform(({ value, obj: source }) => value ?? source.user_address_id)
  @IsUUID()
  userAddressId!: string;

  @IsOptional()
  @Expose({ name: 'addition_info_shop_carts' })
  @Transform(({ value, obj: source }) => value ?? source.addition_info_shop_carts)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShopAdjustmentDto)
  shopAdjustments?: ShopAdjustmentDto[];
}
