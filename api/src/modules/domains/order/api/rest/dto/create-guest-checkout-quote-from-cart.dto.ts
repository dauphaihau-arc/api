import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from 'class-validator';
import { ShippingAddressDto } from './shipping-address.dto';

class ShopAdjustmentDto {
  @ApiProperty({ name: 'shop_id' })
  @Expose({ name: 'shop_id' })
  @Transform(({ value, obj: source }) => value ?? source.shop_id)
  @IsString()
  shopId!: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'promo_codes', type: [String] })
  @Expose({ name: 'promo_codes' })
  @Transform(({ value, obj: source }) => value ?? source.promo_codes)
  @IsArray()
  @IsString({ each: true })
  promoCodes?: string[];

  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(10000)
  note?: string;
}

export class CreateGuestCheckoutQuoteFromCartDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'presentment_currency' })
  @Expose({ name: 'presentment_currency' })
  @Transform(({ value, obj: source }) =>
    value ??
    source.presentmentCurrency ??
    source.presentment_currency)
  @IsString()
  presentmentCurrency?: string;

  @ApiProperty({ name: 'shipping_address', type: ShippingAddressDto })
  @Expose({ name: 'shipping_address' })
  @Transform(({ value, obj: source }) => value ?? source.shipping_address)
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  @IsOptional()
  @ApiPropertyOptional({
    name: 'addition_info_shop_carts',
    type: [ShopAdjustmentDto],
  })
  @Expose({ name: 'addition_info_shop_carts' })
  @Transform(({ value, obj: source }) => value ?? source.addition_info_shop_carts)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShopAdjustmentDto)
  shopAdjustments?: ShopAdjustmentDto[];
}
