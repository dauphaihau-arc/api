import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsUUID,
  Min,
} from 'class-validator';

export class FulfillmentShipmentItemDto {
  @ApiProperty({ name: 'order_item_id' })
  @Expose({ name: 'order_item_id' })
  @Transform(({ value, obj: source }) => value ?? source.order_item_id)
  @IsUUID()
  orderItemId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;
}
