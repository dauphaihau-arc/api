import { Expose, Transform } from 'class-transformer';
import { IsEnum, IsString } from 'class-validator';
import { ProductImageAssetType } from '~/domains/product/domain/enums/product-image-asset-type.enum';

export class IssueProductImageUploadDto {
  @Expose({ name: 'content_type' })
  @Transform(({ value, obj: source }) => value ?? source.content_type)
  @IsString()
  contentType!: string;

  @Expose({ name: 'asset_type' })
  @Transform(({ value, obj: source }) => value ?? source.asset_type)
  @IsEnum(ProductImageAssetType)
  assetType: ProductImageAssetType = ProductImageAssetType.ORIGINAL;
}
