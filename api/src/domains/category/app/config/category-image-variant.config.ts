import type { ImageTransformSpec } from '~/integrations/image-transform/app/image-transform.types';

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

/**
 * Maps a category original storage key (`.../images/original/<file>`) onto the
 * variant object key written by the image pipeline
 * (`.../images/variants/<variant>.webp`).
 *
 * Returns `undefined` when the key does not follow the pipeline layout, so
 * callers can fall back to the original URL instead of emitting a dead link.
 */
export function buildCategoryVariantStorageKey(
  originalStorageKey: string | undefined,
  variant: CategoryImageVariant,
): string | undefined {
  if (!originalStorageKey) {
    return undefined;
  }

  const segments = originalStorageKey.split('/').filter(Boolean);
  const imagesSegmentIndex = segments.lastIndexOf('images');

  if (
    imagesSegmentIndex === -1
    || segments[imagesSegmentIndex + 1] !== 'original'
  ) {
    return undefined;
  }

  return [
    ...segments.slice(0, imagesSegmentIndex + 1),
    'variants',
    `${variant}.webp`,
  ].join('/');
}
