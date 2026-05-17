import { Expose, Transform } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';

export class ListCategoriesQueryDto {
  @IsOptional()
  @Expose({ name: 'parent_id' })
  @Transform(({ value, obj: source }) => value ?? source.parent_id)
  @IsUUID()
  parentId?: string;
}
