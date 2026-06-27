import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum, IsUUID,
} from 'class-validator';
import { PaymentType } from '../../../domain/enums/payment-type.enum';

export class CreateOrderFromCartDto {
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
}
