import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShippingDestinationScope } from '~/domains/shipping/domain/enums/shipping-destination-scope.enum';

const MAX_FEE_MINOR = 100_000_000;

export class ShippingRateDto {
  @ApiProperty({ name: 'destination_scope', enum: ShippingDestinationScope })
  @Expose({ name: 'destination_scope' })
  @Transform(({ value, obj: source }) => value ?? source.destination_scope)
  @IsEnum(ShippingDestinationScope)
  destinationScope!: ShippingDestinationScope;

  @ApiPropertyOptional({ name: 'destination_country' })
  @Expose({ name: 'destination_country' })
  @Transform(({ value, obj: source }) => value ?? source.destination_country)
  @IsOptional()
  @IsString()
  @Length(2, 2)
  destinationCountry?: string;

  @ApiProperty({ name: 'one_item_fee_minor' })
  @Expose({ name: 'one_item_fee_minor' })
  @Transform(({ value, obj: source }) => value ?? source.one_item_fee_minor)
  @IsInt()
  @Min(0)
  @Max(MAX_FEE_MINOR)
  oneItemFeeMinor!: number;

  @ApiProperty({ name: 'additional_item_fee_minor' })
  @Expose({ name: 'additional_item_fee_minor' })
  @Transform(({ value, obj: source }) => value ?? source.additional_item_fee_minor)
  @IsInt()
  @Min(0)
  @Max(MAX_FEE_MINOR)
  additionalItemFeeMinor!: number;

  @ApiPropertyOptional({ name: 'delivery_time_min_days' })
  @Expose({ name: 'delivery_time_min_days' })
  @Transform(({ value, obj: source }) => value ?? source.delivery_time_min_days)
  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryTimeMinDays?: number;

  @ApiPropertyOptional({ name: 'delivery_time_max_days' })
  @Expose({ name: 'delivery_time_max_days' })
  @Transform(({ value, obj: source }) => value ?? source.delivery_time_max_days)
  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryTimeMaxDays?: number;
}

export class ShippingRatesDto {
  @ApiProperty({ type: [ShippingRateDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ShippingRateDto)
  rates!: ShippingRateDto[];
}
