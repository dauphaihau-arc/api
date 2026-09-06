import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ProductWhoMade } from '~/domains/product/domain/enums/product-who-made.enum';

export class UpdateProductDto {
  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  description?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'who_made' })
  @Expose({ name: 'who_made' })
  @Transform(({ value, obj: source }) => value ?? source.who_made)
  @IsEnum(ProductWhoMade)
  whoMade?: ProductWhoMade;

  @IsOptional()
  @ApiPropertyOptional({ name: 'is_digital' })
  @Expose({ name: 'is_digital' })
  @Transform(({ value, obj: source }) => value ?? source.is_digital)
  @IsBoolean()
  isDigital?: boolean;

  @IsOptional()
  @ApiPropertyOptional({ name: 'non_taxable' })
  @Expose({ name: 'non_taxable' })
  @Transform(({ value, obj: source }) => value ?? source.non_taxable)
  @IsBoolean()
  nonTaxable?: boolean;

  @IsOptional()
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(11)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(21, { each: true })
  tags?: string[];

  @IsOptional()
  @ApiPropertyOptional({ name: 'category_id' })
  @Expose({ name: 'category_id' })
  @Transform(({ value, obj: source }) => value ?? source.category_id)
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'variant_group_name' })
  @Expose({ name: 'variant_group_name' })
  @Transform(({ value, obj: source }) => value ?? source.variant_group_name)
  @IsString()
  @MinLength(1)
  variantGroupName?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'variant_sub_group_name' })
  @Expose({ name: 'variant_sub_group_name' })
  @Transform(({ value, obj: source }) => value ?? source.variant_sub_group_name)
  @IsString()
  @MinLength(1)
  variantSubGroupName?: string;
}
