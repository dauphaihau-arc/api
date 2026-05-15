import { Expose, Transform, Type } from 'class-transformer';
import {
  IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateNested 
} from 'class-validator';
import { PaymentType } from '../../../domain/enums/payment-type.enum';

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

export class CreateOrderFromCartDto {
  @Expose({ name: 'payment_type' })
  @Transform(({ value, obj: source }) => value ?? source.payment_type)
  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  @IsOptional()
  @Expose({ name: 'currency' })
  @Transform(({ value, obj: source }) => value ?? source.currency)
  @IsString()
  currency?: string;

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
