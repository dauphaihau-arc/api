import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export class SetProductAttributeValueDto {
  @IsUUID()
  categoryAttributeId!: string;

  @IsOptional()
  @IsUUID()
  selectedOptionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  selectedText?: string;
}

export class SetProductAttributesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetProductAttributeValueDto)
  @ArrayUnique((row: SetProductAttributeValueDto) => row.categoryAttributeId)
  attributes!: SetProductAttributeValueDto[];
}
