import { ProductImageVariant } from '../../domain/enums/product-image-variant.enum';

export type ProductImageVariantSpec = {
  width: number;
  height: number;
  fit: 'cover' | 'contain';
  format: 'webp' | 'jpg' | 'png' | 'avif';
  quality: number;
  removeBackground?: boolean;
};

export const PRODUCT_IMAGE_VARIANT_SPECS: Partial<
  Record<ProductImageVariant, ProductImageVariantSpec>
> = {
  [ProductImageVariant.CARD_1X1]: {
    width: 600,
    height: 600,
    fit: 'cover',
    format: 'webp',
    quality: 82,
    removeBackground: true,
  },
  [ProductImageVariant.THUMB_1X1]: {
    width: 200,
    height: 200,
    fit: 'cover',
    format: 'webp',
    quality: 78,
    removeBackground: true,
  },
  [ProductImageVariant.DETAIL_4X5]: {
    width: 1200,
    height: 1500,
    fit: 'contain',
    format: 'webp',
    quality: 86,
    removeBackground: true,
  },
};
