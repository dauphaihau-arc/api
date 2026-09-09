import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function optionalBlankStringToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined;
  }

  return value;
}

export class SetInventoryOnHandDto {
  @ApiProperty({ name: 'on_hand_quantity' })
  @Expose({ name: 'on_hand_quantity' })
  @Transform(({ value, obj: source }) => value ?? source.on_hand_quantity)
  @IsNumber()
  @Min(0)
  onHandQuantity!: number;

  @ApiProperty({ name: 'expected_on_hand_version' })
  @Expose({ name: 'expected_on_hand_version' })
  @Transform(({ value, obj: source }) => value ?? source.expected_on_hand_version)
  @IsNumber()
  @Min(1)
  expectedOnHandVersion!: number;

  @ApiProperty({ name: 'product_version' })
  @Expose({ name: 'product_version' })
  @Transform(({ value, obj: source }) => value ?? source.product_version)
  @IsNumber()
  @Min(1)
  productVersion!: number;

  @IsOptional()
  @ApiPropertyOptional()
  @Transform(({ value }) => optionalBlankStringToUndefined(value))
  @IsString()
  @MinLength(1)
  sku?: string;

  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'idempotency_key' })
  @Expose({ name: 'idempotency_key' })
  @Transform(({ value, obj: source }) => value ?? source.idempotency_key)
  @IsString()
  @MinLength(1)
  idempotencyKey?: string;
}
