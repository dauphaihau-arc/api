import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import {
  ShippingProfileArchivedError,
  ShippingProfileNotCheckoutReadyError,
  ShippingProfileNotFoundError,
} from '../../errors/shipping-app.error';
import { ProductShippingAssignmentPort } from '../../ports/product-shipping-assignment.port';
import { ShippingProfileRepository } from '../../ports/shipping-profile.repository';
import { toShippingProfileView } from '../../services/shipping-profile-view';
import type { ShippingProfileView } from '../../shipping.types';

export type SetDefaultShippingProfileError =
  | ShippingProfileNotFoundError
  | ShippingProfileArchivedError
  | ShippingProfileNotCheckoutReadyError;

/**
 * Designates the shop's Default Shipping Profile. The designation is a
 * creation-time affordance only: it never assigns a Product, and checkout never
 * substitutes it for a missing assignment.
 */
@Injectable()
export class SetDefaultShippingProfileUseCase {
  constructor(
    private readonly shippingProfileRepository: ShippingProfileRepository,
    private readonly productShippingAssignmentPort: ProductShippingAssignmentPort,
  ) {}

  async execute(
    shopId: string,
    shippingProfileId: string,
  ): Promise<Result<ShippingProfileView, SetDefaultShippingProfileError>> {
    const outcome = await this.shippingProfileRepository.setDefault({
      shopId,
      shippingProfileId,
      isDefault: true,
    });

    if (outcome.status === 'not_found') {
      return err(new ShippingProfileNotFoundError(shippingProfileId));
    }

    if (outcome.status === 'not_eligible') {
      return err(outcome.reason === 'archived'
        ? new ShippingProfileArchivedError('Archived shipping profiles cannot be the shop default')
        : new ShippingProfileNotCheckoutReadyError());
    }

    const assignments = await this.productShippingAssignmentPort.listByShippingProfileIds([
      outcome.profile.id,
    ]);

    return ok(toShippingProfileView(outcome.profile, assignments));
  }
}
