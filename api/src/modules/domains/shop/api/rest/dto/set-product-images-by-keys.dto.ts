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
import { ApiProperty } from '@nestjs/swagger';

export class ProductImageByKeyDto {
  @ApiProperty({ name: 'storage_key' })
  @Expose({ name: 'storage_key' })
  @Transform(({ value, obj: source }) => value ?? source.storage_key)
  @IsString()
  @MinLength(1)
  storageKey!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  rank!: number;
}

export class SetProductImagesByKeysDto {
  @ApiProperty({ type: [ProductImageByKeyDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProductImageByKeyDto)
  images!: ProductImageByKeyDto[];
}
