import type {
  CreateShippingProfileRepositoryInput,
  ShippingProfileListRepositoryQuery,
  ShippingProfileListRepositoryResult,
  ShippingProfileStatusCounts,
  ShippingProfileSummary,
  UpdateShippingProfileRepositoryInput,
} from '../shipping.types';

/**
 * Outcome of a lifecycle/configuration transition that must not leave a
 * published Product on a profile that cannot price a checkout.
 *
 * The guard is evaluated inside the same transaction that locks the profile
 * row, so a concurrent assignment cannot slip between the reference check and
 * the transition.
 */
export type ShippingProfileTransitionOutcome =
  | { status: 'ok'; profile: ShippingProfileSummary }
  | { status: 'version_conflict' }
  | { status: 'published_products_reference'; publishedProductCount: number };

/**
 * Outcome of a Default Shipping Profile designation change. The designation is
 * shop-scoped and at most one profile per shop may hold it, so the write clears
 * any current holder in the same transaction.
 */
export type ShippingProfileDefaultOutcome =
  | { status: 'ok'; profile: ShippingProfileSummary }
  | { status: 'not_found' }
  | { status: 'not_eligible'; reason: 'archived' | 'not_checkout_ready' };

export abstract class ShippingProfileRepository {
  abstract findById(shopId: string, shippingProfileId: string): Promise<ShippingProfileSummary | null>;

  abstract findByIds(shippingProfileIds: string[]): Promise<ShippingProfileSummary[]>;

  abstract listByShop(
    shopId: string,
    query: ShippingProfileListRepositoryQuery,
  ): Promise<ShippingProfileListRepositoryResult>;

  /**
   * How many of the shop's profiles are in each lifecycle state. Archived
   * profiles are excluded from the default list, so the settings surface needs
   * their count to show that they still exist.
   */
  abstract countByStatus(shopId: string): Promise<ShippingProfileStatusCounts>;

  abstract findByNormalizedName(shopId: string, normalizedName: string): Promise<ShippingProfileSummary | null>;

  abstract create(
    input: CreateShippingProfileRepositoryInput,
  ): Promise<ShippingProfileSummary>;

  /**
   * Applies a full replacement of the profile configuration under a lock on the
   * profile row. A transition that would leave the profile non-checkout-ready
   * while published Products still reference it is rejected without writing.
   */
  abstract update(
    input: UpdateShippingProfileRepositoryInput,
  ): Promise<ShippingProfileTransitionOutcome>;

  /**
   * Moves a profile to the archived lifecycle state without touching its
   * configured rates, under a lock on the profile row and with the published
   * reference check performed inside the same transaction.
   */
  abstract archive(input: {
    shopId: string;
    shippingProfileId: string;
    expectedVersion: number;
  }): Promise<ShippingProfileTransitionOutcome>;

  /**
   * Designates or clears the shop's Default Shipping Profile. Exactly one
   * profile per shop holds the designation, so setting it clears the current
   * holder inside the same transaction, and the write never touches the
   * profile's configuration version.
   */
  abstract setDefault(input: {
    shopId: string;
    shippingProfileId: string;
    isDefault: boolean;
  }): Promise<ShippingProfileDefaultOutcome>;
}
