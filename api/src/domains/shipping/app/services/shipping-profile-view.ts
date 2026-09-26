import { ProductState } from '../../../product/domain/enums/product-state.enum';
import {
  collectShippingProfileReadinessIssues,
  isShippingProfileCheckoutReady,
} from '../../domain/shipping-profile-readiness';
import type {
  ProductShippingAssignment,
  ShippingProfileSummary,
  ShippingProfileView,
} from '../shipping.types';

export function toShippingProfileView(
  profile: ShippingProfileSummary,
  assignments: readonly ProductShippingAssignment[],
): ShippingProfileView {
  return {
    profile,
    assignedProductCount: assignments.length,
    publishedProductCount: assignments.filter(
      (assignment) => assignment.productState === ProductState.ACTIVE,
    ).length,
    checkoutReady: isShippingProfileCheckoutReady(profile),
    readinessIssues: collectShippingProfileReadinessIssues(profile),
  };
}
