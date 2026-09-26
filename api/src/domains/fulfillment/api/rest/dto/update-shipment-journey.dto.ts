import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ShipmentStatus } from '../../../domain/enums/shipment-status.enum';

/**
 * Journey transitions a seller can report. Preparation itself is created through
 * the prepare command and cannot be reported as a journey step.
 */
export enum ShipmentJourneyStatus {
  DISPATCHED = 'dispatched',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
}

export class UpdateShipmentJourneyDto {
  @ApiProperty({ enum: ShipmentJourneyStatus })
  @IsEnum(ShipmentJourneyStatus)
  status!: ShipmentStatus;

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
