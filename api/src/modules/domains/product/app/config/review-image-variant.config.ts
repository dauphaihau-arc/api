import { ProductImageVariant } from '../../domain/enums/product-image-variant.enum';
import type { ProductImageVariantSpec } from './product-image-variant.config';

export const REVIEW_IMAGE_VARIANT_SPECS: Partial<
  Record<ProductImageVariant, ProductImageVariantSpec>
> = {
  [ProductImageVariant.CARD_1X1]: {
    width: 600,
    height: 600,
    fit: 'cover',
    format: 'webp',
    quality: 82,
  },
  [ProductImageVariant.THUMB_1X1]: {
    width: 200,
    height: 200,
    fit: 'cover',
    format: 'webp',
    quality: 78,
  },
};
