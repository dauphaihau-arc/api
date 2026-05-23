import { Expose, Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';
import { OrderShippingStatus } from '../../../domain/enums/order-shipping-status.enum';

export class UpdateShopOrderShipmentDto {
  @IsOptional()
  @Expose({ name: 'shipping_status' })
  @Transform(({ value, obj: source }) => value ?? source.shipping_status)
  @IsEnum(OrderShippingStatus)
  shippingStatus?: OrderShippingStatus;

  @IsOptional()
  @Expose({ name: 'tracking_number' })
  @Transform(({ value, obj: source }) => value ?? source.tracking_number)
  @IsString()
  @MaxLength(255)
  trackingNumber?: string;

  @IsOptional()
  @Expose({ name: 'shipping_carrier' })
  @Transform(({ value, obj: source }) => value ?? source.shipping_carrier)
  @IsString()
  @MaxLength(255)
  shippingCarrier?: string;

  @IsOptional()
  @Expose({ name: 'shipment_note' })
  @Transform(({ value, obj: source }) => value ?? source.shipment_note)
  @IsString()
  @MaxLength(5000)
  shipmentNote?: string;
}
