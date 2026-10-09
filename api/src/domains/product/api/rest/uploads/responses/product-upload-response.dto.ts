import { ApiProperty } from '@nestjs/swagger';

export class ProductImageUploadUrlResponseDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  presigned_url!: string;

  @ApiProperty({ example: 'PUT' })
  method!: 'PUT';
}

export class ProductImageUploadedAssetResponseDto {
  @ApiProperty()
  key!: string;
}
