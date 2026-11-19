import {
  DEFAULT_STOREFRONT_LANGUAGE,
  STOREFRONT_LANGUAGES,
  type StorefrontLanguage,
} from '~/platform/config/marketplace.config';

export { DEFAULT_STOREFRONT_LANGUAGE };

/**
 * Resolves the language a storefront request asks for. Localized Content is
 * keyed by Storefront Language, not by the full Locale, so `vi-VN` and `vi-US`
 * both read Vietnamese content.
 */
export function normalizeStorefrontLanguage(
  value?: string | null,
): StorefrontLanguage {
  const language = value?.trim().toLowerCase().split('-')[0];

  return STOREFRONT_LANGUAGES.includes(language as StorefrontLanguage)
    ? language as StorefrontLanguage
    : DEFAULT_STOREFRONT_LANGUAGE;
}

/**
 * Resolves one translated field. This owns only the language boundary;
 * catalog projections decide which fields they expose. English always reads
 * the base source text, while other languages fall back per field.
 */
export function resolveLocalizedValue(
  language: StorefrontLanguage,
  baseValue: string,
  translatedValue: string | null | undefined,
): string {
  if (language === DEFAULT_STOREFRONT_LANGUAGE) {
    return baseValue;
  }

  return translatedValue ?? baseValue;
}
