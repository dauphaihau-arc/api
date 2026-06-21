import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetProductAttributeValueDto {
  @ApiProperty({ name: 'category_attribute_id' })
  @Expose({ name: 'category_attribute_id' })
  @Transform(({ value, obj: source }) => value ?? source.category_attribute_id)
  @IsUUID()
  categoryAttributeId!: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'selected_option_id' })
  @Expose({ name: 'selected_option_id' })
  @Transform(({ value, obj: source }) => value ?? source.selected_option_id)
  @IsUUID()
  selectedOptionId?: string;

  @IsOptional()
  @ApiPropertyOptional({ name: 'selected_text' })
  @Expose({ name: 'selected_text' })
  @Transform(({ value, obj: source }) => value ?? source.selected_text)
  @IsString()
  @MaxLength(255)
  selectedText?: string;
}

export class SetProductAttributesDto {
  @ApiProperty({ type: [SetProductAttributeValueDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetProductAttributeValueDto)
  @ArrayUnique((row: SetProductAttributeValueDto) => row.categoryAttributeId)
  attributes!: SetProductAttributeValueDto[];
}
