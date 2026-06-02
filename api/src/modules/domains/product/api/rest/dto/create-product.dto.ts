import {
  Expose,
  Transform
} from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength
} from 'class-validator';
import { ProductVariantType } from '~/modules/domains/product/domain/enums/product-variant-type.enum';
import { ProductWhoMade } from '~/modules/domains/product/domain/enums/product-who-made.enum';

export class CreateProductDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'category_id' })
  @Expose({ name: 'category_id' })
  @Transform(({ value, obj: source }) => value ?? source.category_id)
  @IsUUID()
  categoryId?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @ApiProperty({ name: 'who_made', enum: ProductWhoMade })
  @Expose({ name: 'who_made' })
  @Transform(({ value, obj: source }) => value ?? source.who_made)
  @IsEnum(ProductWhoMade)
  whoMade!: ProductWhoMade;

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
  @ApiPropertyOptional({ name: 'variant_type', enum: ProductVariantType })
  @Expose({ name: 'variant_type' })
  @Transform(({ value, obj: source }) => value ?? source.variant_type)
  @IsEnum(ProductVariantType)
  variantType?: ProductVariantType;

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
