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
import { MARKETPLACE_CURRENCIES } from '~/config/marketplace.config';

export class ProductPricingRowDto {
  @Expose({ name: 'inventory_id' })
  @Transform(({ value, obj: source }) => value ?? source.inventory_id)
  @IsUUID()
  inventoryId!: string;

  @Expose({ name: 'amount_minor' })
  @Transform(({ value, obj: source }) => value ?? source.amount_minor)
  @IsNumber()
  @Min(50)
  @Max(5_000_000)
  amountMinor!: number;

  @IsOptional()
  @Expose({ name: 'original_amount_minor' })
  @Transform(({ value, obj: source }) => value ?? source.original_amount_minor)
  @IsNumber()
  @Min(0)
  @Max(5_000_000)
  originalAmountMinor?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @IsIn(MARKETPLACE_CURRENCIES)
  currency?: string;
}

export class SetProductPricingDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductPricingRowDto)
  pricing!: ProductPricingRowDto[];
}
