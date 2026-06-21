import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { GuestCheckoutIdentityDto } from './guest-checkout-identity.dto';

export class CreateGuestOrderForBuyNowDto {
  @ApiProperty({ name: 'payment_type' })
  @Expose({ name: 'payment_type' })
  @Transform(({ value, obj: source }) => value ?? source.payment_type)
  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  @ApiProperty({ name: 'quote_id' })
  @Expose({ name: 'quote_id' })
  @Transform(({ value, obj: source }) => value ?? source.quote_id)
  @IsUUID()
  quoteId!: string;

  @ApiProperty({ type: GuestCheckoutIdentityDto })
  @ValidateNested()
  @Type(() => GuestCheckoutIdentityDto)
  guest!: GuestCheckoutIdentityDto;
}
