import {
  STOREFRONT_LANGUAGES,
  type StorefrontLanguage,
} from '~/platform/config/marketplace.config';
import {
  normalizeCatalogSearchText,
  type CatalogLocalizedContent,
} from './documents/catalog-localized-content';
import { DEFAULT_STOREFRONT_LANGUAGE } from '~/platform/localization/storefront-language';

export interface CatalogLocalizationVerifiableDocument {
  productId: string;
  title: string;
  description: string;
  localized?: Partial<Record<StorefrontLanguage, CatalogLocalizedContent>>;
}

export interface CatalogLocalizationVerificationIssue {
  productId: string;
  fields: string[];
}

export interface CatalogLocalizationVerificationReport {
  totalDocuments: number;
  staleDocuments: number;
  staleFields: number;
  issues: CatalogLocalizationVerificationIssue[];
}

/**
 * Checks that every projected document carries complete, internally
 * consistent content for every Storefront Language. It catches documents
 * written before localized fields existed and normalized fields that no
 * longer match their stored display text after a rebuild.
 */
export function verifyCatalogLocalizedContent(
  documents: readonly CatalogLocalizationVerifiableDocument[],
): CatalogLocalizationVerificationReport {
  const issues: CatalogLocalizationVerificationIssue[] = [];

  for (const document of documents) {
    const fields = findStaleFields(document);

    if (fields.length > 0) {
      issues.push({ productId: document.productId, fields });
    }
  }

  return {
    totalDocuments: documents.length,
    staleDocuments: issues.length,
    staleFields: issues.reduce((total, issue) => total + issue.fields.length, 0),
    issues,
  };
}

function findStaleFields(
  document: CatalogLocalizationVerifiableDocument,
): string[] {
  const fields: string[] = [];

  for (const language of STOREFRONT_LANGUAGES) {
    const content = document.localized?.[language];

    if (!content) {
      fields.push(`localized.${language}`);
      continue;
    }

    fields.push(...findStaleContentFields(language, content));

    if (
      language === DEFAULT_STOREFRONT_LANGUAGE
      && (content.title !== document.title
        || content.description !== document.description)
    ) {
      fields.push('localized.en.display');
    }
  }

  return fields;
}

function findStaleContentFields(
  language: StorefrontLanguage,
  content: CatalogLocalizedContent,
): string[] {
  const fields: string[] = [];
  const path = (field: string) => `localized.${language}.${field}`;

  if (content.titleNormalized !== normalizeCatalogSearchText(content.title)) {
    fields.push(path('titleNormalized'));
  }

  if (
    content.descriptionNormalized !==
    normalizeCatalogSearchText(content.description)
  ) {
    fields.push(path('descriptionNormalized'));
  }

  if (
    content.categoryNameNormalized !==
    normalizeCatalogSearchText(content.categoryName)
  ) {
    fields.push(path('categoryNameNormalized'));
  }

  if (!Array.isArray(content.suggest) || !Array.isArray(content.keywords)) {
    fields.push(path('searchTerms'));
  }

  return fields;
}
