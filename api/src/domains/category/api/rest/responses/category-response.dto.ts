import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CategoryAttributeOptionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  value!: string;

  @ApiProperty()
  rank!: number;
}

export class CategoryAttributeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  input_type!: string;

  @ApiProperty()
  is_required!: boolean;

  @ApiProperty()
  rank!: number;

  @ApiProperty({ type: [CategoryAttributeOptionResponseDto] })
  @Type(() => CategoryAttributeOptionResponseDto)
  options!: CategoryAttributeOptionResponseDto[];
}

export class CategoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ required: false })
  parent_id?: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  rank!: number;

  @ApiProperty({ required: false })
  image_url?: string;

  @ApiProperty({ type: [String], required: false })
  featured_facet_keys?: string[];

  @ApiProperty({ type: [CategoryAttributeResponseDto] })
  @Type(() => CategoryAttributeResponseDto)
  attributes!: CategoryAttributeResponseDto[];
}

export class CategorySuggestionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  last_name_category!: string;

  @ApiProperty({ type: [String] })
  categories_related!: string[];
}

export class CategorySuggestionListResponseDto {
  @ApiProperty({ type: [CategorySuggestionResponseDto] })
  @Type(() => CategorySuggestionResponseDto)
  categories!: CategorySuggestionResponseDto[];
}

export class CategoryAttributeListResponseDto {
  @ApiProperty({ type: [CategoryAttributeResponseDto] })
  @Type(() => CategoryAttributeResponseDto)
  attributes!: CategoryAttributeResponseDto[];
}
