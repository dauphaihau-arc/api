import { Expose, Transform } from 'class-transformer';
import {
  IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength 
} from 'class-validator';
import { PaymentType } from '../../../domain/enums/payment-type.enum';

export class CreateOrderForBuyNowDto {
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
  @IsString()
  currency?: string;

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
}
