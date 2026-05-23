import { Expose, Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { GuestCheckoutIdentityDto } from './guest-checkout-identity.dto';
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

export class CreateGuestOrderFromCartDto {
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
  @Expose({ name: 'addition_info_shop_carts' })
  @Transform(({ value, obj: source }) => value ?? source.addition_info_shop_carts)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShopAdjustmentDto)
  shopAdjustments?: ShopAdjustmentDto[];
}
