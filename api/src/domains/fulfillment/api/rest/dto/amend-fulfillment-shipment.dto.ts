import { Expose, Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { FulfillmentShipmentItemDto } from './fulfillment-shipment-item.dto';

export class AmendFulfillmentShipmentDto {
  @IsOptional()
  @ApiPropertyOptional({ type: [FulfillmentShipmentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FulfillmentShipmentItemDto)
  items?: FulfillmentShipmentItemDto[];

  @IsOptional()
  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  carrier?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'tracking_number', maxLength: 255 })
  @Expose({ name: 'tracking_number' })
  @Transform(({ value, obj: source }) => value ?? source.tracking_number)
  @IsString()
  @MaxLength(255)
  trackingNumber?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'shipment_note', maxLength: 5000 })
  @Expose({ name: 'shipment_note' })
  @Transform(({ value, obj: source }) => value ?? source.shipment_note)
  @IsString()
  @MaxLength(5000)
  shipmentNote?: string;
}
