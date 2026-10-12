import { isCategoryBearingRequestPath } from './category-identity-generation.interceptor';

describe('isCategoryBearingRequestPath', () => {
  it('gates the category-bearing category, product, and shop paths', () => {
    const gatedPaths = [
      '/v1/categories',
      '/v1/categories/suggestions',
      '/v1/categories/42',
      '/v1/categories/42/attributes',
      '/v1/products',
      '/v1/products/facets',
      '/v1/shops/shop_1/products',
      '/v1/shops/shop_1/products/drafts',
      '/v1/shops/shop_1/products/prod_1/attributes',
    ];

    for (const path of gatedPaths) {
      expect(isCategoryBearingRequestPath(path)).toBe(true);
    }
  });

  it('exempts the probe and unrelated nested product endpoints', () => {
    const exemptPaths = [
      '/v1/categories/contract',
      '/v1/products/prod_1/inventory/events',
      '/v1/products/by-slug/arc-store/handmade-bag',
      '/v1/products/by-slug/arc-store/handmade-bag/reviews',
      '/v1/products/by-slug/arc-store/handmade-bag/review-images',
      '/v1/products/by-slug/arc-store/handmade-bag/recommendations',
      '/v1/products/by-slug/arc-store/handmade-bag/recommendation-sections',
      '/v1/products/suggestions',
      '/v1/products/recently-viewed',
      '/v1/products/trending',
      '/v1/products/best-sellers',
      '/v1/shops/shop_1',
      '/v1/shops/me',
    ];

    for (const path of exemptPaths) {
      expect(isCategoryBearingRequestPath(path)).toBe(false);
    }
  });
});
