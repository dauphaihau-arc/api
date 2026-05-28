import { Expose, Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ShippingAddressDto } from './shipping-address.dto';

export class CreateGuestCheckoutQuoteForBuyNowDto {
  @Expose({ name: 'cart_id' })
  @Transform(({ value, obj: source }) => value ?? source.cart_id)
  @IsUUID()
  cartId!: string;

  @Expose({ name: 'shipping_address' })
  @Transform(({ value, obj: source }) => value ?? source.shipping_address)
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  @IsOptional()
  @Expose({ name: 'promo_codes' })
  @Transform(({ value, obj: source }) => value ?? source.promo_codes)
  @IsArray()
  @IsString({ each: true })
  promoCodes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  note?: string;

  @IsOptional()
  @Expose({ name: 'presentment_currency' })
  @Transform(({ value, obj: source }) =>
    value
    ?? source.presentmentCurrency
    ?? source.presentment_currency)
  @IsString()
  presentmentCurrency?: string;
}
