import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';

export class UpdateShopOrderShipmentDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'shipping_status' })
  @Expose({ name: 'shipping_status' })
  @Transform(({ value, obj: source }) => value ?? source.shipping_status)
  @IsEnum(OrderShippingStatus)
  shippingStatus?: OrderShippingStatus;

  @IsOptional()
  @ApiPropertyOptional({ name: 'tracking_number', maxLength: 255 })
  @Expose({ name: 'tracking_number' })
  @Transform(({ value, obj: source }) => value ?? source.tracking_number)
  @IsString()
  @MaxLength(255)
  trackingNumber?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'shipping_carrier', maxLength: 255 })
  @Expose({ name: 'shipping_carrier' })
  @Transform(({ value, obj: source }) => value ?? source.shipping_carrier)
  @IsString()
  @MaxLength(255)
  shippingCarrier?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'shipment_note', maxLength: 5000 })
  @Expose({ name: 'shipment_note' })
  @Transform(({ value, obj: source }) => value ?? source.shipment_note)
  @IsString()
  @MaxLength(5000)
  shipmentNote?: string;
}
