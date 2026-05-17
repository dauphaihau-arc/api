import { Expose, Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength
} from 'class-validator';

export class CreateCategoryAttributeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @Expose({ name: 'input_type' })
  @Transform(({ value, obj: source }) => value ?? source.input_type)
  @IsString()
  @MinLength(1)
  inputType?: string;

  @IsOptional()
  @Expose({ name: 'is_required' })
  @Transform(({ value, obj: source }) => value ?? source.is_required)
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  rank?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  options!: string[];
}
