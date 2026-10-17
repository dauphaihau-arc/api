import {
  CATEGORY_IMAGE_VARIANTS,
  buildCategoryVariantStorageKey,
} from './category-image-variant.config';

describe('buildCategoryVariantStorageKey', () => {
  it('maps an original key onto the variant object the image pipeline writes', () => {
    expect(
      buildCategoryVariantStorageKey(
        'dev/public/categories/uuid/images/original/mugs.png',
        CATEGORY_IMAGE_VARIANTS.ROOT_2X3,
      ),
    ).toBe('dev/public/categories/uuid/images/variants/root_2x3.webp');

    expect(
      buildCategoryVariantStorageKey(
        'dev/public/categories/uuid/images/original/mugs.png',
        CATEGORY_IMAGE_VARIANTS.RECOMMENDED_1X1,
      ),
    ).toBe('dev/public/categories/uuid/images/variants/recommended_1x1.webp');
  });

  it('returns undefined for keys outside the pipeline layout', () => {
    expect(
      buildCategoryVariantStorageKey(
        'categories/clothing.jpg',
        CATEGORY_IMAGE_VARIANTS.ROOT_2X3,
      ),
    ).toBeUndefined();

    expect(
      buildCategoryVariantStorageKey(undefined, CATEGORY_IMAGE_VARIANTS.ROOT_2X3),
    ).toBeUndefined();
  });
});
