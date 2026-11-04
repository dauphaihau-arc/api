import { Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class IssueReviewImageUploadDto {
  @ApiProperty({ name: 'content_type' })
  @Expose({ name: 'content_type' })
  @Transform(({ value, obj: source }) => value ?? source.content_type)
  @IsString()
  contentType!: string;

  @ApiProperty({ name: 'size_bytes' })
  @Expose({ name: 'size_bytes' })
  @Transform(({ value, obj: source }) => value ?? source.size_bytes)
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
