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
  @IsUUID()
  categoryId?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @IsEnum(ProductWhoMade)
  whoMade!: ProductWhoMade;

  @IsOptional()
  @IsBoolean()
  isDigital?: boolean;

  @IsOptional()
  @IsBoolean()
  nonTaxable?: boolean;

  @IsOptional()
  @IsEnum(ProductVariantType)
  variantType?: ProductVariantType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  variantGroupName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  variantSubGroupName?: string;
}
