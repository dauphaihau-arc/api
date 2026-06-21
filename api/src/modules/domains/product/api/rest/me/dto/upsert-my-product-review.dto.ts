import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, 
} from 'class-validator';

export class UpsertMyProductReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @Expose({ name: 'rating' })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @Expose({ name: 'title' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @Expose({ name: 'body' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @ApiPropertyOptional({ name: 'image_keys', type: [String] })
  @Expose({ name: 'image_keys' })
  @Transform(({ value, obj: source }) => value ?? source.image_keys)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageKeys?: string[];
}
