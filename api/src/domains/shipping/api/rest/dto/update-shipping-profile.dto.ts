import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShippingProfileStatus } from '~/domains/shipping/domain/enums/shipping-profile-status.enum';
import { ShippingRateDto } from './shipping-rate.dto';

export class UpdateShippingProfileDto {
  @ApiProperty({ name: 'version' })
  @Expose({ name: 'version' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: [ShippingProfileStatus.DRAFT, ShippingProfileStatus.ACTIVE] })
  @IsOptional()
  @IsEnum(ShippingProfileStatus)
  status?: ShippingProfileStatus;

  @ApiPropertyOptional({ name: 'ship_from_country', nullable: true })
  @Expose({ name: 'ship_from_country' })
  @Transform(({ value, obj: source }) => value ?? source.ship_from_country)
  @IsOptional()
  @IsString()
  @Length(2, 2)
  shipFromCountry?: string | null;

  @ApiPropertyOptional({ name: 'ship_from_postal', nullable: true })
  @Expose({ name: 'ship_from_postal' })
  @Transform(({ value, obj: source }) => value ?? source.ship_from_postal)
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Ship-from postal code must be between 2 and 20 characters' })
  @MaxLength(20, { message: 'Ship-from postal code must be between 2 and 20 characters' })
  @Matches(/^[A-Za-z0-9 -]+$/, {
    message: 'Ship-from postal code can only contain letters, numbers, spaces, and hyphens',
  })
  shipFromPostal?: string | null;

  @ApiPropertyOptional({ name: 'processing_time_min_days', nullable: true })
  @Expose({ name: 'processing_time_min_days' })
  @Transform(({ value, obj: source }) => value ?? source.processing_time_min_days)
  @IsOptional()
  @IsInt()
  @Min(0)
  processingTimeMinDays?: number | null;

  @ApiPropertyOptional({ name: 'processing_time_max_days', nullable: true })
  @Expose({ name: 'processing_time_max_days' })
  @Transform(({ value, obj: source }) => value ?? source.processing_time_max_days)
  @IsOptional()
  @IsInt()
  @Min(0)
  processingTimeMaxDays?: number | null;

  @ApiPropertyOptional({ type: [ShippingRateDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ShippingRateDto)
  rates?: ShippingRateDto[];
}
