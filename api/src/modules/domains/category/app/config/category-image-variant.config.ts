import type { ImageTransformSpec } from '~/modules/shared/image-transform/app/image-transform.types';

export const CATEGORY_IMAGE_VARIANTS = {
  RECOMMENDED_1X1: 'recommended_1x1',
  ROOT_2X3: 'root_2x3',
} as const;

export type CategoryImageVariant =
  (typeof CATEGORY_IMAGE_VARIANTS)[keyof typeof CATEGORY_IMAGE_VARIANTS];

export const CATEGORY_IMAGE_VARIANT_SPECS: Record<
  CategoryImageVariant,
  ImageTransformSpec
> = {
  [CATEGORY_IMAGE_VARIANTS.RECOMMENDED_1X1]: {
    width: 200,
    height: 200,
    fit: 'cover',
    format: 'webp',
    quality: 80,
  },
  [CATEGORY_IMAGE_VARIANTS.ROOT_2X3]: {
    width: 420,
    height: 630,
    fit: 'cover',
    format: 'webp',
    quality: 82,
  },
};
