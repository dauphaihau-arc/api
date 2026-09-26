import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '~/platform/application/result';
import { ShippingProfileNotFoundError } from '../../errors/shipping-app.error';
import { ProductShippingAssignmentPort } from '../../ports/product-shipping-assignment.port';
import { ShippingProfileRepository } from '../../ports/shipping-profile.repository';
import { toShippingProfileView } from '../../services/shipping-profile-view';
import type { ShippingProfileView } from '../../shipping.types';

export type ClearDefaultShippingProfileError = ShippingProfileNotFoundError;

/**
 * Clears the shop's Default Shipping Profile. Clearing is idempotent: a profile
 * that is not the default keeps no designation and changes nothing. Unlike
 * setting, clearing never applies the checkout-ready rule, so the only failure
 * is a profile that is not in this shop.
 */
@Injectable()
export class ClearDefaultShippingProfileUseCase {
  constructor(
    private readonly shippingProfileRepository: ShippingProfileRepository,
    private readonly productShippingAssignmentPort: ProductShippingAssignmentPort,
  ) {}

  async execute(
    shopId: string,
    shippingProfileId: string,
  ): Promise<Result<ShippingProfileView, ClearDefaultShippingProfileError>> {
    const outcome = await this.shippingProfileRepository.setDefault({
      shopId,
      shippingProfileId,
      isDefault: false,
    });

    if (outcome.status !== 'ok') {
      return err(new ShippingProfileNotFoundError(shippingProfileId));
    }

    const assignments = await this.productShippingAssignmentPort.listByShippingProfileIds([
      outcome.profile.id,
    ]);

    return ok(toShippingProfileView(outcome.profile, assignments));
  }
}
