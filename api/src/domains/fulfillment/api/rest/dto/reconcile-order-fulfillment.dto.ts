import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { FulfillmentShipmentItemDto } from './fulfillment-shipment-item.dto';

export class ReconcileOrderFulfillmentDto {
  @ApiProperty({ type: [FulfillmentShipmentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FulfillmentShipmentItemDto)
  items!: FulfillmentShipmentItemDto[];

}
