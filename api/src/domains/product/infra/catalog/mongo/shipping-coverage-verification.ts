import { ProductState } from '../../../domain/enums/product-state.enum';

export interface CatalogShippingCoverageVerifiableDocument {
  productId?: string;
  state?: string;
  isDigital?: boolean;
  shipping?: {
    shipsToCountryCodes?: unknown;
    shipsWorldwide?: unknown;
  };
}

export interface CatalogShippingCoverageVerificationIssue {
  productId: string;
  fields: string[];
}

export interface CatalogShippingCoverageVerificationReport {
  totalDocuments: number;
  invalidDocuments: number;
  issues: CatalogShippingCoverageVerificationIssue[];
}

const ALPHA_2_COUNTRY_CODE = /^[A-Z]{2}$/;

/**
 * Checks that every projected catalog document carries the derived Shipping
 * Coverage fields, and that a physical Product is never projected without any
 * coverage. It catches documents written before the projection existed and
 * partial or malformed values written by an older mapper.
 */
export function verifyCatalogShippingCoverage(
  documents: readonly CatalogShippingCoverageVerifiableDocument[],
): CatalogShippingCoverageVerificationReport {
  const issues: CatalogShippingCoverageVerificationIssue[] = [];

  for (const document of documents) {
    // Orphaned drafts can survive an in-place reprojection; the storefront
    // never reads them, so only published documents are verified.
    if (document.state !== undefined && document.state !== ProductState.ACTIVE) {
      continue;
    }

    const fields = findInvalidFields(document);

    if (fields.length > 0) {
      issues.push({
        productId: document.productId ?? '<unknown>',
        fields,
      });
    }
  }

  return {
    totalDocuments: documents.length,
    invalidDocuments: issues.length,
    issues,
  };
}

function findInvalidFields(
  document: CatalogShippingCoverageVerifiableDocument,
): string[] {
  const fields: string[] = [];
  const shipping = document.shipping;

  if (!shipping || typeof shipping !== 'object') {
    // A digital Product is available without any shipping coverage, so only a
    // physical Product must carry the projected fields.
    if (document.isDigital !== true) {
      fields.push('shipping');
    }

    return fields;
  }

  const countryCodes = Array.isArray(shipping.shipsToCountryCodes)
    ? shipping.shipsToCountryCodes
    : undefined;
  const hasValidCountryCodes = countryCodes !== undefined
    && countryCodes.every(
      (countryCode: unknown) =>
        typeof countryCode === 'string' && ALPHA_2_COUNTRY_CODE.test(countryCode),
    )
    && new Set(countryCodes).size === countryCodes.length;

  if (!hasValidCountryCodes) {
    fields.push('shipping.shipsToCountryCodes');
  }

  if (typeof shipping.shipsWorldwide !== 'boolean') {
    fields.push('shipping.shipsWorldwide');
  }

  return fields;
}
