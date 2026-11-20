import {
  STOREFRONT_LANGUAGES,
  type StorefrontLanguage,
} from '~/platform/config/marketplace.config';
import {
  DEFAULT_STOREFRONT_LANGUAGE,
  resolveLocalizedValue,
} from '~/platform/localization/storefront-language';

/**
 * One Storefront Language's resolved catalog content. `title` and
 * `description` are display values; `titleNormalized` and
 * `descriptionNormalized` are folded for search. Category names are included
 * because catalog cards can group by category without a second lookup.
 */
export interface CatalogLocalizedContent {
  title: string;
  titleNormalized: string;
  description: string;
  descriptionNormalized: string;
  categoryName: string;
  categoryNameNormalized: string;
  suggest: string[];
  keywords: string[];
}

export type CatalogLocalizedContentByLanguage = Record<
  StorefrontLanguage,
  CatalogLocalizedContent
>;

export interface CatalogProductTranslationContent {
  language: StorefrontLanguage;
  title?: string | null;
  description?: string | null;
}

export interface CatalogCategoryTranslationContent {
  language: StorefrontLanguage;
  name?: string | null;
}

export interface CatalogLocalizedContentSource {
  title: string;
  description: string;
  categoryName?: string | null;
  /** Terms appended to the localized title for autocomplete suggestions. */
  suggestTerms?: readonly string[];
  /** Terms appended to the localized title and description for search. */
  keywordTerms?: readonly string[];
  translations?: readonly CatalogProductTranslationContent[];
  categoryTranslations?: readonly CatalogCategoryTranslationContent[];
}

type LocalizableCatalogDocument = {
  title: string;
  description: string;
  localized?: Partial<Record<StorefrontLanguage, CatalogLocalizedContent>>;
  search?: { suggest?: string[]; keywords?: string[] };
  suggest?: string[];
  keywords?: string[];
};

/**
 * Builds resolved content for every supported Storefront Language. Translation
 * rows are matched by language; unsupported languages are ignored and English
 * always reads the base source text. Missing translations fall back per field.
 */
export function buildCatalogLocalizedContent(
  source: CatalogLocalizedContentSource,
): CatalogLocalizedContentByLanguage {
  const translationsByLanguage = new Map(
    (source.translations ?? []).map((translation) => [
      translation.language,
      translation,
    ]),
  );
  const categoryTranslationsByLanguage = new Map(
    (source.categoryTranslations ?? []).map((translation) => [
      translation.language,
      translation,
    ]),
  );

  return Object.fromEntries(
    STOREFRONT_LANGUAGES.map((language) => {
      const translation = translationsByLanguage.get(language);
      const categoryTranslation = categoryTranslationsByLanguage.get(language);
      const title = resolveLocalizedValue(
        language,
        source.title,
        translation?.title,
      );
      const description = resolveLocalizedValue(
        language,
        source.description,
        translation?.description,
      );
      const categoryName = source.categoryName
        ? resolveLocalizedValue(
          language,
          source.categoryName,
          categoryTranslation?.name,
        )
        : '';

      return [
        language,
        {
          title,
          titleNormalized: normalizeCatalogSearchText(title),
          description,
          descriptionNormalized: normalizeCatalogSearchText(description),
          categoryName,
          categoryNameNormalized: normalizeCatalogSearchText(categoryName),
          suggest: uniqueStrings([
            title,
            ...(source.suggestTerms ?? []),
          ].map(normalizeCatalogSearchText)),
          keywords: uniqueStrings([
            title,
            description,
            ...(source.keywordTerms ?? []),
          ].map(normalizeCatalogSearchText)),
        },
      ];
    }),
  ) as CatalogLocalizedContentByLanguage;
}

/**
 * Reads the active language's content from a projected document. Documents
 * written before localized fields existed fall back to their English
 * title/description/search fields so a rolling deploy stays readable.
 */
export function resolveCatalogLocalizedContent(
  document: LocalizableCatalogDocument,
  language: StorefrontLanguage = DEFAULT_STOREFRONT_LANGUAGE,
): CatalogLocalizedContent {
  const content = document.localized?.[language] ??
    document.localized?.[DEFAULT_STOREFRONT_LANGUAGE];

  if (content) {
    return content;
  }

  return {
    title: document.title,
    titleNormalized: normalizeCatalogSearchText(document.title),
    description: document.description,
    descriptionNormalized: normalizeCatalogSearchText(document.description),
    categoryName: '',
    categoryNameNormalized: '',
    suggest: document.suggest ?? document.search?.suggest ?? [],
    keywords: document.keywords ?? document.search?.keywords ?? [],
  };
}

/**
 * Normalizes text for catalog matching. It lowercases, collapses whitespace,
 * and folds diacritics so `vay` and `váy` match the same Vietnamese content.
 * Product option and attribute labels stay as stored values; only free text
 * passes through this helper.
 */
export function normalizeCatalogSearchText(value?: string | null): string {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function toLocalizedContentPath(
  language: StorefrontLanguage,
  field: keyof CatalogLocalizedContent,
): string {
  return `localized.${language}.${field}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
