import { IsOptional, IsUUID } from 'class-validator';

export class ListCategoriesQueryDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
