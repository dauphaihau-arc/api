import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * The signed carrier event body. `event_code` is validated against the
 * supported evidence codes by the use case, which reports the domain error
 * `INVALID_CARRIER_EVENT` instead of a generic field failure.
 */
export class CarrierWebhookEventDto {
  @Expose({ name: 'event_id' })
  @Transform(({ value, obj: source }) => value ?? source.event_id)
  @ApiProperty({ name: 'event_id', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  eventId!: string;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  carrier!: string;

  @Expose({ name: 'tracking_number' })
  @Transform(({ value, obj: source }) => value ?? source.tracking_number)
  @ApiProperty({ name: 'tracking_number', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  trackingNumber!: string;

  @Expose({ name: 'event_code' })
  @Transform(({ value, obj: source }) => value ?? source.event_code)
  @ApiProperty({ name: 'event_code', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  eventCode!: string;

  @IsOptional()
  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  location?: string;

  @Expose({ name: 'occurred_at' })
  @Transform(({ value, obj: source }) => value ?? source.occurred_at)
  @ApiProperty({ name: 'occurred_at', format: 'date-time' })
  @IsISO8601()
  occurredAt!: string;
}
