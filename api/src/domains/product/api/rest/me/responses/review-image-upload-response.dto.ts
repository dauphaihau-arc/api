import { ApiProperty } from '@nestjs/swagger';

export class ReviewImageUploadUrlResponseDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  presigned_url!: string;

  @ApiProperty({ example: 'PUT' })
  method!: 'PUT';
}

export class ReviewImageUploadedAssetResponseDto {
  @ApiProperty()
  key!: string;
}
