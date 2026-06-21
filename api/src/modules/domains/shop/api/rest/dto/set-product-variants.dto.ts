import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductVariantRowDto {
  @ApiProperty({ name: 'option_value_1' })
  @Expose({ name: 'option_value_1' })
  @Transform(({ value, obj: source }) => value ?? source.option_value_1)
  @IsString()
  @MinLength(1)
  optionValue1!: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'option_value_2' })
  @Expose({ name: 'option_value_2' })
  @Transform(({ value, obj: source }) => value ?? source.option_value_2)
  @IsString()
  @MinLength(1)
  optionValue2?: string;
}

export class SetProductVariantsDto {
  @ApiProperty({ type: [ProductVariantRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantRowDto)
  variants!: ProductVariantRowDto[];
}
