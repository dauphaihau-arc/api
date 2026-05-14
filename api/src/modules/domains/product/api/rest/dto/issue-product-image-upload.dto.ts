import { IsEnum, IsString } from 'class-validator';
import { ProductImageAssetType } from '~/modules/domains/product/domain/enums/product-image-asset-type.enum';

export class IssueProductImageUploadDto {
  @IsString()
  contentType!: string;

  @IsEnum(ProductImageAssetType)
  assetType: ProductImageAssetType = ProductImageAssetType.ORIGINAL;
}
