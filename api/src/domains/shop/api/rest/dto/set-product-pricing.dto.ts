import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MARKETPLACE_CURRENCIES } from '~/platform/config/marketplace.config';

export class ProductPricingRowDto {
  @ApiProperty({ name: 'inventory_id' })
  @Expose({ name: 'inventory_id' })
  @Transform(({ value, obj: source }) => value ?? source.inventory_id)
  @IsUUID()
  inventoryId!: string;

  @ApiProperty({ name: 'amount_minor' })
  @Expose({ name: 'amount_minor' })
  @Transform(({ value, obj: source }) => value ?? source.amount_minor)
  @IsNumber()
  @Min(50)
  @Max(5_000_000)
  amountMinor!: number;

  @IsOptional()
  @ApiPropertyOptional({ name: 'original_amount_minor' })
  @Expose({ name: 'original_amount_minor' })
  @Transform(({ value, obj: source }) => value ?? source.original_amount_minor)
  @IsNumber()
  @Min(0)
  @Max(5_000_000)
  originalAmountMinor?: number;

  @IsOptional()
  @ApiPropertyOptional({ enum: MARKETPLACE_CURRENCIES })
  @IsString()
  @Length(3, 3)
  @IsIn(MARKETPLACE_CURRENCIES)
  currency?: string;
}

export class SetProductPricingDto {
  @ApiProperty({ type: [ProductPricingRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductPricingRowDto)
  pricing!: ProductPricingRowDto[];
}
