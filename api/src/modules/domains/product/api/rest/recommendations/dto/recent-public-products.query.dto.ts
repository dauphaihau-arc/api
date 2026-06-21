import { Type } from 'class-transformer';
import {
  IsOptional, Max, Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RecentPublicProductsQueryDto {
  @IsOptional()
  @ApiPropertyOptional()
  @Type(() => Number)
  @Min(1)
  @Max(24)
  limit: number = 10;
}
