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
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  rank!: number;

  @ApiProperty({
    required: false,
    description: 'Primary image URL: the root_2x3 variant, or the original when no variant exists.',
  })
  image_url?: string;

  @ApiProperty({
    required: false,
    description: 'Square 1:1 variant URL, for compact and round category tiles.',
  })
  image_url_1x1?: string;

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

export class CategoryAncestorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;
}

export class CategoryResolutionCategoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [String], required: false })
  featured_facet_keys?: string[];
}

export class CategoryResolutionResponseDto {
  @ApiProperty({ type: CategoryResolutionCategoryResponseDto })
  @Type(() => CategoryResolutionCategoryResponseDto)
  category!: CategoryResolutionCategoryResponseDto;

  @ApiProperty({ type: [CategoryAncestorResponseDto] })
  @Type(() => CategoryAncestorResponseDto)
  ancestry!: CategoryAncestorResponseDto[];

  @ApiProperty()
  canonical_path!: string;
}

export class CategoryIdentityContractResponseDto {
  @ApiProperty()
  version!: string;
}
