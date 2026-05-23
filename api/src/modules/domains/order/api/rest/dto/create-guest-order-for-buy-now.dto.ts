import { Expose, Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { GuestCheckoutIdentityDto } from './guest-checkout-identity.dto';
import { ShippingAddressDto } from './shipping-address.dto';

export class CreateGuestOrderForBuyNowDto {
  @Expose({ name: 'cart_id' })
  @Transform(({ value, obj: source }) => value ?? source.cart_id)
  @IsUUID()
  cartId!: string;

  @Expose({ name: 'payment_type' })
  @Transform(({ value, obj: source }) => value ?? source.payment_type)
  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  @IsOptional()
  @Expose({ name: 'currency' })
  @Transform(({ value, obj: source }) => value ?? source.currency)
  @IsString()
  currency?: string;

  @ValidateNested()
  @Type(() => GuestCheckoutIdentityDto)
  guest!: GuestCheckoutIdentityDto;

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
}
