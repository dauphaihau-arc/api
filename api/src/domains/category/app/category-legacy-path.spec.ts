import { isCategoryLegacyPath } from './category-legacy-path';

describe('isCategoryLegacyPath', () => {
  it('accepts recorded hierarchical paths, including single-segment roots', () => {
    expect(isCategoryLegacyPath('/c/home')).toBe(true);
    expect(isCategoryLegacyPath('/c/home/gaming-laptops')).toBe(true);
    expect(isCategoryLegacyPath('/c/home/caf\u00e9-cadeaux')).toBe(true);
  });

  it('rejects shapes that cannot be a recorded path', () => {
    expect(isCategoryLegacyPath('/c/')).toBe(false);
    expect(isCategoryLegacyPath('/c')).toBe(false);
    expect(isCategoryLegacyPath('/c/home/')).toBe(false);
    expect(isCategoryLegacyPath('/c/home?page=2')).toBe(false);
    expect(isCategoryLegacyPath('/c/home#top')).toBe(false);
    expect(isCategoryLegacyPath('/c/home gaming')).toBe(false);
    expect(isCategoryLegacyPath('/other/home')).toBe(false);
    expect(isCategoryLegacyPath('')).toBe(false);
  });
});
