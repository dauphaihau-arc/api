import { ProductImageVariant } from '../../domain/enums/product-image-variant.enum';

export type ProductImageVariantSpec = {
  width: number;
  height: number;
  fit: 'cover' | 'contain';
  format: 'webp' | 'jpg' | 'png' | 'avif';
  quality: number;
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
  },
};
