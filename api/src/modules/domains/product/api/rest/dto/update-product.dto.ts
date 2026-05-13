import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength
} from 'class-validator';
import { ProductWhoMade } from '~/modules/domains/product/domain/enums/product-who-made.enum';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  description?: string;

  @IsOptional()
  @IsEnum(ProductWhoMade)
  whoMade?: ProductWhoMade;

  @IsOptional()
  @IsBoolean()
  isDigital?: boolean;

  @IsOptional()
  @IsBoolean()
  nonTaxable?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  variantGroupName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  variantSubGroupName?: string;
}
