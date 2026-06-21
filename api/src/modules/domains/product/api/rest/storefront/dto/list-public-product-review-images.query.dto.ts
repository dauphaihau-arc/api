import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsInt, IsOptional, IsString, Max, Min, 
} from 'class-validator';

export class ListPublicProductReviewImagesQueryDto {
  @ApiPropertyOptional({ default: 12 })
  @Expose({ name: 'limit' })
  @Transform(({ value }) => value == null ? undefined : Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional()
  @Expose({ name: 'cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
