import type { ProductState } from '~/domains/product/domain/enums/product-state.enum';
import type { ShippingProfileStatus } from '../domain/enums/shipping-profile-status.enum';
import type { ShippingDestinationScope } from '../domain/enums/shipping-destination-scope.enum';
import type { ShippingDurationRange } from '../domain/shipping-duration-range';
import type { ShippingProfileReadinessIssue } from '../domain/shipping-profile-readiness';
import type {
  ShippingDestination,
  ShippingDestinationRate,
} from '../domain/shipping-destination-matcher';

export interface ShippingRateInput {
  destinationScope: ShippingDestinationScope;
  destinationCountry?: string;
  oneItemFeeMinor: number;
  additionalItemFeeMinor: number;
  deliveryTimeMinDays?: number;
  deliveryTimeMaxDays?: number;
}

export interface ShippingProfileSummary {
  id: string;
  shopId: string;
  shopPublicId: string;
  name: string;
  status: ShippingProfileStatus;
  version: number;
  /**
   * True when this profile is the shop's Default Shipping Profile. At most one
   * profile per shop holds the designation, and it never assigns a Product.
   */
  isDefault: boolean;
  /**
   * Currency the stored rate amounts are denominated in, resolved from the
   * owning Shop. Profiles never persist a currency of their own.
   */
  shopCurrency: string;
  shipFromCountry?: string;
  shipFromPostal?: string;
  /** Elapsed calendar-day handling range before dispatch, when configured. */
  processingTimeMinDays?: number;
  processingTimeMaxDays?: number;
  rates: ShippingDestinationRate[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateShippingProfileRepositoryInput {
  shopId: string;
  name: string;
  normalizedName: string;
  status: ShippingProfileStatus;
  shipFromCountry?: string;
  shipFromPostal?: string;
  processingTimeMinDays?: number;
  processingTimeMaxDays?: number;
  rates: ShippingRateInput[];
}

export interface UpdateShippingProfileRepositoryInput {
  shopId: string;
  shippingProfileId: string;
  expectedVersion: number;
  name: string;
  normalizedName: string;
  status: ShippingProfileStatus;
  shipFromCountry?: string;
  shipFromPostal?: string;
  processingTimeMinDays?: number;
  processingTimeMaxDays?: number;
  rates: ShippingRateInput[];
}

export interface ProductShippingAssignment {
  productId: string;
  shippingProfileId: string;
  productState: ProductState;
}

/**
 * Authoritative physical/digital fact for checkout shipping. Digital Products
 * are not carrier-delivered, so they carry no Shipping Profile and are excluded
 * from charge, estimate, and shipping snapshots instead of being priced with a
 * fallback. Physical Products without a ready profile stay unavailable.
 */
export interface ProductShippingShippability {
  productId: string;
  /** Absent when the Product has no Shipping Profile assignment. */
  shippingProfileId?: string;
  productState: ProductState;
  isDigital: boolean;
}

export interface ShippingProfileView {
  profile: ShippingProfileSummary;
  assignedProductCount: number;
  publishedProductCount: number;
  checkoutReady: boolean;
  readinessIssues: ShippingProfileReadinessIssue[];
}

/** One page of Shipping Profiles as the repository returns it. */
export interface ShippingProfileListRepositoryQuery {
  page: number;
  limit: number;
  /** Lifecycle states to include. Archived profiles are only listed when asked for. */
  statuses: ShippingProfileStatus[];
}

export interface ShippingProfileListRepositoryResult {
  items: ShippingProfileSummary[];
  total: number;
}

/** How many profiles the shop holds per lifecycle state, across every page. */
export interface ShippingProfileStatusCounts {
  active: number;
  draft: number;
  archived: number;
}

export interface ShippingProfileListResult {
  results: ShippingProfileView[];
  page: number;
  limit: number;
  totalPages: number;
  totalResults: number;
  statusCounts: ShippingProfileStatusCounts;
}

export type ProductShippingUnavailableReason =
  | 'missing_assignment'
  | 'profile_not_found'
  | 'profile_not_ready'
  | 'unsupported_destination'
  /** The shop's currency cannot be converted into the checkout currency: never charged as-is. */
  | 'unsupported_currency';

/**
 * Resolution of one purchased Product to a usable destination rate. Ticket 09
 * consumes this shape instead of implementing another matcher or Product
 * fallback.
 */
export interface ProductShippingResolution {
  productId: string;
  profileId?: string;
  profileName?: string;
  /** Profile optimistic version, snapshotted so quote reuse can bind it. */
  profileVersion?: number;
  /** Owning shop of the resolved profile. */
  profileShopId?: string;
  available: boolean;
  /**
   * True for a digital Product: it needs no carrier delivery, so it carries no
   * charge, readiness issue, or estimate and is never "unavailable" for
   * shipping reasons.
   */
  isDigital: boolean;
  reason?: ProductShippingUnavailableReason;
  readinessIssues: ShippingProfileReadinessIssue[];
  /** Currency the matched rate amounts are denominated in (the Shop currency). */
  currency?: string;
  rate?: ShippingDestinationRate;
  /**
   * Seller-configured handling range, matched-rate transit range, and the
   * combined estimate inputs. Consumers (ticket 09) anchor these with their own
   * quote timestamp through the shared calculator.
   */
  processingTime?: ShippingDurationRange;
  deliveryTime?: ShippingDurationRange;
}

/** One purchased unit of a Product Variant inside a shop's checkout quote. */
export interface CheckoutShippingUnitInput {
  shopId: string;
  productId: string;
  inventoryId: string;
  quantity: number;
}

export interface CheckoutShippingQuoteInput {
  units: CheckoutShippingUnitInput[];
  destination: ShippingDestination;
  /** Server instant the estimate is anchored to (the quote creation time). */
  anchorAt: Date;
  /**
   * Currency the accepted charge must be denominated in. Seller rate amounts
   * live in the owning shop's currency and are converted into this checkout
   * currency through the canonical FX seam before any money is accepted.
   */
  checkoutCurrency: string;
}

/** Rate provenance of a shipping amount converted into the checkout currency. */
export interface ShippingQuoteFxProvenance {
  rate: string;
  source: string;
  effectiveAt: Date;
  sourceTimestamp?: Date;
}

/**
 * Immutable per-unit pricing facts: the resolved profile/rate identity and
 * version, the applied fees, and the seller-configured ranges. Later profile or
 * Product edits cannot rewrite these.
 *
 * `currency` and the fee amounts are always the checkout currency. The seller's
 * original amounts are retained as source provenance only when the owning shop's
 * currency differed from the checkout currency.
 */
export interface ShippingQuoteUnitSnapshot {
  productId: string;
  inventoryId: string;
  quantity: number;
  profileId: string;
  profileVersion: number;
  profileShopId: string;
  rateId: string;
  rateDestinationScope: ShippingDestinationScope;
  rateDestinationCountry?: string;
  currency: string;
  oneItemFeeMinor: number;
  additionalItemFeeMinor: number;
  sourceCurrency?: string;
  sourceOneItemFeeMinor?: number;
  sourceAdditionalItemFeeMinor?: number;
  fx?: ShippingQuoteFxProvenance;
  processingTimeMinDays: number;
  processingTimeMaxDays: number;
  deliveryTimeMinDays: number;
  deliveryTimeMaxDays: number;
}

export interface ShippingQuoteBaseUnit {
  productId: string;
  inventoryId: string;
  oneItemFeeMinor: number;
}

/** Additional-item units grouped by Variant identity, excluding the base unit. */
export interface ShippingQuoteAdditionalComponent {
  productId: string;
  inventoryId: string;
  quantity: number;
  additionalItemFeeMinor: number;
}

/**
 * Etsy-style combined fixed shipping for one shop: the highest applicable
 * one-item fee charged once, then the applicable additional-item fee for every
 * remaining purchased unit.
 */
export interface ShippingQuoteCharge {
  currency: string;
  quantity: number;
  baseUnit: ShippingQuoteBaseUnit;
  baseItemFeeMinor: number;
  baseItemTotalMinor: number;
  additionalItemsQuantity: number;
  additionalComponents: ShippingQuoteAdditionalComponent[];
  additionalItemFeeMinorTotal: number;
  totalMinor: number;
}

/** Combined seller estimate: union of the units' Processing and Delivery ranges. */
export interface ShippingQuoteEstimate {
  processingTimeMinDays: number;
  processingTimeMaxDays: number;
  deliveryTimeMinDays: number;
  deliveryTimeMaxDays: number;
  combinedMinDays: number;
  combinedMaxDays: number;
  anchorAt: Date;
  earliestDeliveryDate: Date;
  latestDeliveryDate: Date;
}

export interface CheckoutShippingShopQuote {
  shopId: string;
  currency: string;
  charge: ShippingQuoteCharge;
  estimate: ShippingQuoteEstimate;
  units: ShippingQuoteUnitSnapshot[];
}

/** A Product that cannot be delivered to the buyer destination, with no fallback. */
export interface ShippingQuoteUnavailableProduct {
  productId: string;
  inventoryId: string;
  quantity: number;
  reason: ProductShippingUnavailableReason;
  readinessIssues: ShippingProfileReadinessIssue[];
}

export interface CheckoutShippingQuote {
  anchorAt: Date;
  shops: CheckoutShippingShopQuote[];
  unavailable: ShippingQuoteUnavailableProduct[];
}
