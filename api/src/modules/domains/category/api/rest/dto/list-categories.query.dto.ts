import { Expose, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListCategoriesQueryDto {
  @IsOptional()
  @ApiPropertyOptional({ name: 'parent_id' })
  @Expose({ name: 'parent_id' })
  @Transform(({ value, obj: source }) => value ?? source.parent_id)
  @IsUUID()
  parentId?: string;
}
