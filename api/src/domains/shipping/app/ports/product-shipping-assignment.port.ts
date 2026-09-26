import type {
  ProductShippingAssignment,
  ProductShippingShippability,
} from '../shipping.types';

/**
 * Products assigned to Shipping Profiles. Shipping owns the assignment
 * contract; the Product domain owns the assignment column, and the adapter in
 * Shipping's infra layer keeps that dependency narrow and returns plain data.
 */
export abstract class ProductShippingAssignmentPort {
  /**
   * Every requested Product with its authoritative physical/digital fact and
   * optional assignment, so checkout can tell a digital Product apart from a
   * physical Product that is missing its Shipping Profile.
   */
  abstract listByProductIds(productIds: string[]): Promise<ProductShippingShippability[]>;

  abstract listByShippingProfileIds(
    shippingProfileIds: string[],
  ): Promise<ProductShippingAssignment[]>;
}
