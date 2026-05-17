import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';

export class ProductImageByKeyDto {
  @Expose({ name: 'storage_key' })
  @Transform(({ value, obj: source }) => value ?? source.storage_key)
  @IsString()
  @MinLength(1)
  storageKey!: string;

  @IsNumber()
  @Min(1)
  rank!: number;
}

export class SetProductImagesByKeysDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProductImageByKeyDto)
  images!: ProductImageByKeyDto[];
}
