import { Expose, Transform } from 'class-transformer';
import { IsInt, IsString, Min } from 'class-validator';

export class IssueReviewImageUploadDto {
  @Expose({ name: 'content_type' })
  @Transform(({ value, obj: source }) => value ?? source.content_type)
  @IsString()
  contentType!: string;

  @Expose({ name: 'size_bytes' })
  @Transform(({ value, obj: source }) => value ?? source.size_bytes)
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
