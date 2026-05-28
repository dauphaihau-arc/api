import { Expose, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PaymentType } from '../../../domain/enums/payment-type.enum';
import { GuestCheckoutIdentityDto } from './guest-checkout-identity.dto';

export class CreateGuestOrderFromCartDto {
  @Expose({ name: 'payment_type' })
  @Transform(({ value, obj: source }) => value ?? source.payment_type)
  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  @Expose({ name: 'quote_id' })
  @Transform(({ value, obj: source }) => value ?? source.quote_id)
  @IsUUID()
  quoteId!: string;

  @ValidateNested()
  @Type(() => GuestCheckoutIdentityDto)
  guest!: GuestCheckoutIdentityDto;
}
