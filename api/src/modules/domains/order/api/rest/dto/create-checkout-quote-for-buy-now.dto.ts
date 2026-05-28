import { Expose, Transform } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCheckoutQuoteForBuyNowDto {
  @Expose({ name: 'cart_id' })
  @Transform(({ value, obj: source }) => value ?? source.cart_id)
  @IsUUID()
  cartId!: string;

  @Expose({ name: 'user_address_id' })
  @Transform(({ value, obj: source }) => value ?? source.user_address_id)
  @IsUUID()
  userAddressId!: string;

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
