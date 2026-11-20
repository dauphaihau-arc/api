import {
  DEFAULT_STOREFRONT_LANGUAGE,
  normalizeStorefrontLanguage,
  resolveLocalizedValue,
} from './storefront-language';

describe('normalizeStorefrontLanguage', () => {
  it('extracts the Storefront Language from a supported Locale', () => {
    expect(normalizeStorefrontLanguage('vi-VN')).toBe('vi');
    expect(normalizeStorefrontLanguage('vi-US')).toBe('vi');
    expect(normalizeStorefrontLanguage('en-VN')).toBe('en');
    expect(normalizeStorefrontLanguage('en-US')).toBe('en');
  });

  it('accepts a bare Storefront Language', () => {
    expect(normalizeStorefrontLanguage('vi')).toBe('vi');
    expect(normalizeStorefrontLanguage('EN')).toBe('en');
  });

  it('falls back to English for absent or unsupported values', () => {
    expect(normalizeStorefrontLanguage(undefined)).toBe(DEFAULT_STOREFRONT_LANGUAGE);
    expect(normalizeStorefrontLanguage(null)).toBe(DEFAULT_STOREFRONT_LANGUAGE);
    expect(normalizeStorefrontLanguage('')).toBe(DEFAULT_STOREFRONT_LANGUAGE);
    expect(normalizeStorefrontLanguage('fr-FR')).toBe(DEFAULT_STOREFRONT_LANGUAGE);
    expect(normalizeStorefrontLanguage('vi-VN-extra')).toBe('vi');
  });
});

describe('resolveLocalizedValue', () => {
  it('ignores translation rows for English', () => {
    expect(resolveLocalizedValue('en', 'Linen Dress', 'Váy lanh')).toBe('Linen Dress');
  });

  it('uses the translated value for Vietnamese', () => {
    expect(resolveLocalizedValue('vi', 'Linen Dress', 'Váy lanh')).toBe('Váy lanh');
  });

  it('falls back per field when the Vietnamese value is null or absent', () => {
    expect(resolveLocalizedValue('vi', 'Linen Dress', null)).toBe('Linen Dress');
    expect(resolveLocalizedValue('vi', 'Linen Dress', undefined)).toBe('Linen Dress');
  });

  it('resolves each field independently in either fallback direction', () => {
    expect(resolveLocalizedValue('vi', 'Linen Dress', null)).toBe('Linen Dress');
    expect(resolveLocalizedValue('vi', 'Relaxed linen dress', 'Váy lanh nhẹ')).toBe(
      'Váy lanh nhẹ',
    );
  });

  it('preserves an explicitly empty translated value', () => {
    expect(resolveLocalizedValue('vi', 'Linen Dress', '')).toBe('');
  });
});
