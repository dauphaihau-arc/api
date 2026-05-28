import { Expose, Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ShippingAddressDto } from './shipping-address.dto';

class ShopAdjustmentDto {
  @Transform(({ value, obj: source }) => value ?? source.shop_id)
  @IsString()
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

export class CreateGuestCheckoutQuoteFromCartDto {
  @IsOptional()
  @Expose({ name: 'presentment_currency' })
  @Transform(({ value, obj: source }) =>
    value
    ?? source.presentmentCurrency
    ?? source.presentment_currency)
  @IsString()
  presentmentCurrency?: string;

  @Expose({ name: 'shipping_address' })
  @Transform(({ value, obj: source }) => value ?? source.shipping_address)
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  @IsOptional()
  @Expose({ name: 'addition_info_shop_carts' })
  @Transform(({ value, obj: source }) => value ?? source.addition_info_shop_carts)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShopAdjustmentDto)
  shopAdjustments?: ShopAdjustmentDto[];
}
